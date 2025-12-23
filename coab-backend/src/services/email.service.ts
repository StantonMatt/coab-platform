/**
 * Email Service using Twilio SendGrid
 * Handles auto-payment notifications and other transactional emails
 */

import { env } from '../config/env.js';
import { formatearPesos } from '@coab/utils';

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SendGridResponse {
  errors?: Array<{ message: string }>;
}

/**
 * Check if SendGrid is configured
 */
export function isConfigured(): boolean {
  return !!env.SENDGRID_API_KEY;
}

/**
 * Send email via SendGrid API
 */
export async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string
): Promise<EmailResult> {
  if (!env.SENDGRID_API_KEY) {
    console.warn('SendGrid no configurado - email no enviado');
    return {
      success: false,
      error: 'SendGrid no configurado',
    };
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: env.SENDGRID_FROM_EMAIL, name: 'COAB Sistema de Agua' },
        subject,
        content: [
          ...(textContent ? [{ type: 'text/plain', value: textContent }] : []),
          { type: 'text/html', value: htmlContent },
        ],
      }),
    });

    // SendGrid returns 202 for accepted
    if (response.status === 202) {
      const messageId = response.headers.get('x-message-id');
      return {
        success: true,
        messageId: messageId || undefined,
      };
    }

    // Try to parse error
    let errorMsg = `Error HTTP ${response.status}`;
    try {
      const data = (await response.json()) as SendGridResponse;
      if (data.errors && data.errors.length > 0) {
        errorMsg = data.errors.map((e) => e.message).join(', ');
      }
    } catch {
      // Ignore parse errors
    }

    console.error('SendGrid error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  } catch (error: any) {
    console.error('SendGrid exception:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send verification code email for contact changes
 */
export async function sendVerificationEmail(
  email: string,
  code: string
): Promise<EmailResult> {
  const subject = `Tu código de verificación COAB: ${code}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0066CC 0%, #004499 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">Código de Verificación</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Has solicitado cambiar tu correo electrónico en COAB.</p>
    
    <div style="background: white; border: 2px solid #0066CC; border-radius: 12px; padding: 25px; margin: 25px 0; text-align: center;">
      <p style="margin: 0 0 10px; color: #666; font-size: 14px;">Tu código de verificación es:</p>
      <p style="margin: 0; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0066CC;">${code}</p>
    </div>
    
    <p style="color: #666; font-size: 14px;">Este código expira en <strong>10 minutos</strong>.</p>
    
    <p style="color: #888; font-size: 13px;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>
    
    <p style="margin-top: 30px; color: #888; font-size: 12px;">
      Este es un mensaje automático, por favor no respondas a este correo.
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
    <p>COAB - Cooperativa de Agua Bellavista</p>
  </div>
</body>
</html>`;

  const textContent = `Tu código de verificación COAB es: ${code}

Este código expira en 10 minutos.

Si no solicitaste este cambio, ignora este correo.`;

  return sendEmail(email, subject, htmlContent, textContent);
}

/**
 * Send auto-payment success notification
 */
export async function sendAutoPaymentSuccess(
  clienteEmail: string,
  clienteNombre: string,
  monto: number,
  periodo: string,
  nuevoSaldo: number
): Promise<EmailResult> {
  const firstName = clienteNombre.split(' ')[0];
  const montoFormateado = formatearPesos(monto);
  const saldoFormateado = formatearPesos(nuevoSaldo);

  const subject = `Pago automático procesado - ${montoFormateado}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0066CC 0%, #004499 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">Pago Automático Exitoso</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Hola <strong>${firstName}</strong>,</p>
    
    <p>Tu pago automático fue procesado exitosamente.</p>
    
    <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Monto pagado:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #00AA44; font-size: 18px;">${montoFormateado}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Período:</td>
          <td style="padding: 8px 0; text-align: right;">${periodo}</td>
        </tr>
        <tr style="border-top: 1px solid #e0e0e0;">
          <td style="padding: 12px 0 0; color: #666;">Nuevo saldo:</td>
          <td style="padding: 12px 0 0; text-align: right; font-weight: bold;">${saldoFormateado}</td>
        </tr>
      </table>
    </div>
    
    <p style="color: #666; font-size: 14px;">Puedes ver el detalle de tu cuenta en el <a href="${env.FRONTEND_URL}" style="color: #0066CC;">portal de clientes</a>.</p>
    
    <p style="margin-top: 30px; color: #888; font-size: 12px;">
      Este es un mensaje automático, por favor no respondas a este correo.
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
    <p>COAB - Cooperativa de Agua Bellavista</p>
  </div>
</body>
</html>`;

  const textContent = `Hola ${firstName},

Tu pago automático de ${montoFormateado} fue procesado exitosamente.

Boleta: ${periodo}
Nuevo saldo: ${saldoFormateado}

Gracias por usar COAB.`;

  return sendEmail(clienteEmail, subject, htmlContent, textContent);
}

/**
 * Send auto-payment failure notification (attempts 1-2)
 */
export async function sendAutoPaymentFailed(
  clienteEmail: string,
  clienteNombre: string,
  monto: number,
  errorMensaje: string,
  intentoNumero: number
): Promise<EmailResult> {
  const firstName = clienteNombre.split(' ')[0];
  const montoFormateado = formatearPesos(monto);

  const subject = `Problema con tu pago automático - Intento ${intentoNumero}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #FF6B00 0%, #CC5500 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">Problema con Pago Automático</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Hola <strong>${firstName}</strong>,</p>
    
    <p>No pudimos procesar tu pago automático de <strong>${montoFormateado}</strong>.</p>
    
    <div style="background: #FFF3E0; border: 1px solid #FFB74D; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #E65100;"><strong>Motivo:</strong> ${errorMensaje}</p>
    </div>
    
    <p><strong>¿Qué sucederá ahora?</strong></p>
    <p>Reintentaremos el cobro en 2 días. Si prefieres, puedes pagar manualmente desde el <a href="${env.FRONTEND_URL}" style="color: #0066CC;">portal de clientes</a>.</p>
    
    <p style="color: #666; font-size: 14px;">
      Te recomendamos verificar que tu tarjeta tenga fondos suficientes y esté activa.
    </p>
    
    <p style="margin-top: 30px; color: #888; font-size: 12px;">
      Este es un mensaje automático, por favor no respondas a este correo.
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
    <p>COAB - Cooperativa de Agua Bellavista</p>
  </div>
</body>
</html>`;

  const textContent = `Hola ${firstName},

No pudimos procesar tu pago automático de ${montoFormateado}.

Motivo: ${errorMensaje}

Reintentaremos en 2 días. Si deseas, puedes pagar manualmente en el portal.`;

  return sendEmail(clienteEmail, subject, htmlContent, textContent);
}

/**
 * Send auto-payment disabled notification (after 3 failures)
 */
export async function sendAutoPaymentDisabled(
  clienteEmail: string,
  clienteNombre: string
): Promise<EmailResult> {
  const firstName = clienteNombre.split(' ')[0];

  const subject = 'Tu pago automático ha sido deshabilitado';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">Pago Automático Deshabilitado</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Hola <strong>${firstName}</strong>,</p>
    
    <p>Después de 3 intentos, no pudimos procesar tu pago automático.</p>
    
    <div style="background: #FFEBEE; border: 1px solid #EF9A9A; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #C62828;"><strong>Tu pago automático ha sido deshabilitado.</strong></p>
    </div>
    
    <p><strong>¿Qué debes hacer?</strong></p>
    <ol>
      <li>Ingresa al <a href="${env.FRONTEND_URL}" style="color: #0066CC;">portal de clientes</a> y paga tu cuenta manualmente.</li>
      <li>Verifica que tu tarjeta esté activa y tenga fondos.</li>
      <li>Si lo deseas, puedes volver a activar el pago automático desde tu perfil.</li>
    </ol>
    
    <p style="color: #666; font-size: 14px;">
      Si necesitas ayuda, contáctanos.
    </p>
    
    <p style="margin-top: 30px; color: #888; font-size: 12px;">
      Este es un mensaje automático, por favor no respondas a este correo.
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
    <p>COAB - Cooperativa de Agua Bellavista</p>
  </div>
</body>
</html>`;

  const textContent = `Hola ${firstName},

Después de 3 intentos, no pudimos procesar tu pago automático.

Tu pago automático ha sido deshabilitado. Por favor, paga manualmente en el portal y verifica tu tarjeta.

Si necesitas ayuda, contacta a COAB.`;

  return sendEmail(clienteEmail, subject, htmlContent, textContent);
}

