import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './config/env.js';

/**
 * COAB Platform Backend
 * Entry point for the Fastify API server
 */
async function main() {
  try {
    const app = await buildApp();

    // Listen on all interfaces (required for Docker/Railway)
    await app.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    console.log(`
╔══════════════════════════════════════════════════════╗
║         COAB Platform Backend - Servidor API         ║
╠══════════════════════════════════════════════════════╣
║  Estado:      ✓ Activo                               ║
║  Puerto:      ${String(env.PORT).padEnd(40)}║
║  Ambiente:    ${env.NODE_ENV.padEnd(40)}║
║  Health:      http://localhost:${env.PORT}/health              ║
║  API Base:    http://localhost:${env.PORT}/api/v1              ║
╚══════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

main();







