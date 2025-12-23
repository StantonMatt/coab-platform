import { z } from 'zod';

/**
 * Environment configuration schema with Zod validation
 * Validates all required environment variables on startup
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  TZ: z.string().default('America/Santiago'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL válida de PostgreSQL'),
  DIRECT_URL: z.string().url('DIRECT_URL debe ser una URL válida de PostgreSQL').optional(),

  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),

  // Optional: Twilio WhatsApp & SMS
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(), // For SMS verification codes

  // Optional: Twilio SendGrid Email
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().default('noreply@coab.cl'),

  // Optional: Cron secret for automated jobs
  CRON_SECRET: z.string().optional(),

  // Optional: Mercado Pago
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_PUBLIC_KEY: z.string().optional(),

  // Transbank OneClick
  // Default values are Transbank's public integration/sandbox credentials
  // For production, set your own credentials in .env
  TRANSBANK_COMMERCE_CODE: z.string().default('597055555541'),
  TRANSBANK_API_KEY: z.string().default('579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C'),
  TRANSBANK_CHILD_COMMERCE_CODE: z.string().default('597055555542'),
  TRANSBANK_ENVIRONMENT: z.enum(['integration', 'production']).default('integration'),

  // Optional: Sentry
  SENTRY_DSN: z.string().url().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Frontend URL (for setup links)
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 * Throws on invalid configuration
 */
function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Error de configuración de entorno:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();







