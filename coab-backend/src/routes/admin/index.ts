import { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../../middleware/auth.middleware.js';

// Import domain routes
import rutasRoutes from './rutas.routes.js';
import tarifasRoutes from './tarifas.routes.js';
import multasRoutes from './multas.routes.js';
import cortesRoutes from './cortes.routes.js';
import repactacionesRoutes from './repactaciones.routes.js';
import medidoresRoutes from './medidores.routes.js';
import lecturasRoutes from './lecturas.routes.js';
import subsidiosRoutes from './subsidios.routes.js';
import descuentosRoutes from './descuentos.routes.js';
import pagosRoutes from './pagos.routes.js';
import boletasRoutes from './boletas.routes.js';
import clientesRoutes from './clientes.routes.js';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply admin auth to ALL routes in this plugin
  fastify.addHook('onRequest', requireAdmin);

  // Register domain routes
  await fastify.register(rutasRoutes);
  await fastify.register(tarifasRoutes);
  await fastify.register(multasRoutes);
  await fastify.register(cortesRoutes);
  await fastify.register(repactacionesRoutes);
  await fastify.register(medidoresRoutes);
  await fastify.register(lecturasRoutes);
  await fastify.register(subsidiosRoutes);
  await fastify.register(descuentosRoutes);
  await fastify.register(pagosRoutes);
  await fastify.register(boletasRoutes);
  await fastify.register(clientesRoutes);
};

export default adminRoutes;

