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

  // Optional: Infobip WhatsApp
  INFOBIP_API_KEY: z.string().optional(),
  INFOBIP_BASE_URL: z.string().url().optional(),
  INFOBIP_WHATSAPP_SENDER: z.string().optional(),

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







