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

interface InfobipResponse {
  messages?: Array<{ messageId: string }>;
  requestError?: {
    serviceException?: {
      text?: string;
    };
  };
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
 * Send WhatsApp message via Infobip
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<WhatsAppResult> {
  const INFOBIP_API_KEY = env.INFOBIP_API_KEY;
  const INFOBIP_BASE_URL = env.INFOBIP_BASE_URL || 'https://api.infobip.com';
  const INFOBIP_WHATSAPP_SENDER = env.INFOBIP_WHATSAPP_SENDER;

  if (!INFOBIP_API_KEY || !INFOBIP_WHATSAPP_SENDER) {
    console.warn('Infobip not configured - message not sent');
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
    const response = await fetch(`${INFOBIP_BASE_URL}/whatsapp/1/message/text`, {
      method: 'POST',
      headers: {
        Authorization: `App ${INFOBIP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: INFOBIP_WHATSAPP_SENDER,
        to: formattedPhone,
        content: {
          text: message,
        },
      }),
    });

    const data = (await response.json()) as InfobipResponse;

    if (response.ok && data.messages?.[0]) {
      return {
        success: true,
        messageId: data.messages[0].messageId,
      };
    }

    return {
      success: false,
      error:
        data.requestError?.serviceException?.text || 'Error sending WhatsApp',
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

