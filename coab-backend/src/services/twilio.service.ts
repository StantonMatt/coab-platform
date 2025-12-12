import {
  parsePhoneNumber,
  isValidPhoneNumber,
  CountryCode,
} from 'libphonenumber-js';
import { env } from '../config/env.js';

interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface TwilioResponse {
  sid?: string;
  status?: string;
  error_code?: number;
  error_message?: string;
}

/**
 * Format Chilean phone number to international format
 * Handles formats like: +56912345678, 912345678, 56912345678
 */
export function formatChileanPhone(phone: string): string | null {
  try {
    // Clean the input
    const cleaned = phone.replace(/\D/g, '');

    // Try parsing with Chile as default country
    if (isValidPhoneNumber(phone, 'CL' as CountryCode)) {
      const parsed = parsePhoneNumber(phone, 'CL' as CountryCode);
      return parsed.format('E.164'); // Returns +56912345678
    }

    // Try with explicit +56 if not present
    if (!cleaned.startsWith('56') && cleaned.length === 9) {
      const withPrefix = `+56${cleaned}`;
      if (isValidPhoneNumber(withPrefix)) {
        const parsed = parsePhoneNumber(withPrefix);
        return parsed.format('E.164');
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Send WhatsApp message via Twilio
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<WhatsAppResult> {
  const TWILIO_ACCOUNT_SID = env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = env.TWILIO_AUTH_TOKEN;
  const TWILIO_WHATSAPP_FROM = env.TWILIO_WHATSAPP_FROM;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    console.warn('Twilio not configured - message not sent');
    return {
      success: false,
      error: 'WhatsApp no configurado',
    };
  }

  const formattedPhone = formatChileanPhone(phone);
  if (!formattedPhone) {
    return {
      success: false,
      error: `Número de teléfono inválido: ${phone}`,
    };
  }

  try {
    // Twilio uses Basic Auth with AccountSID:AuthToken
    const authHeader = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    // Twilio WhatsApp requires the "whatsapp:" prefix
    const toWhatsApp = `whatsapp:${formattedPhone}`;

    console.log(`Twilio: Sending to ${toWhatsApp} from ${TWILIO_WHATSAPP_FROM}`);
    
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: TWILIO_WHATSAPP_FROM,
          To: toWhatsApp,
          Body: message,
        }),
      }
    );

    const data = (await response.json()) as TwilioResponse;
    console.log('Twilio response:', JSON.stringify(data, null, 2));

    if (response.ok && data.sid) {
      return {
        success: true,
        messageId: data.sid,
      };
    }

    const errorMsg = data.error_message || `Error ${data.error_code || response.status}`;
    console.error('Twilio error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send password setup link via WhatsApp
 */
export async function sendSetupLinkViaWhatsApp(
  clienteId: bigint,
  setupUrl: string,
  clienteNombre: string,
  clienteTelefono: string,
  logger: { info: (msg: string, data?: object) => void }
): Promise<WhatsAppResult> {
  // Get first name only for greeting
  const firstName = clienteNombre.split(' ')[0];

  const message = `Hola ${firstName},

Bienvenido al Portal de Clientes de COAB.

Para configurar tu contraseña y acceder a tu cuenta, ingresa al siguiente enlace:

${setupUrl}

Este enlace expira en 48 horas.

Si no solicitaste este mensaje, ignóralo.

- COAB Sistema de Agua`;

  const result = await sendWhatsAppMessage(clienteTelefono, message);

  // Log the attempt
  logger.info('WhatsApp setup link sent', {
    clienteId: clienteId.toString(),
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  });

  return result;
}

