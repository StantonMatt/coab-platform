import prisma from '../lib/prisma.js';

/**
 * Unlock a customer account
 * Resets failed login attempts and clears lockout
 * @param clienteId - Customer ID to unlock
 * @param adminEmail - Admin who performed the action (for audit log)
 */
export async function unlockCustomerAccount(
  clienteId: bigint,
  adminEmail: string
) {
  // Find the customer
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
  });

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  // Store previous state for audit log
  const datosAnteriores = {
    intentos_fallidos: cliente.intentos_fallidos,
    bloqueado_hasta: cliente.bloqueado_hasta,
    estado_cuenta: cliente.estado_cuenta,
  };

  // Unlock the account
  await prisma.clientes.update({
    where: { id: clienteId },
    data: {
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      estado_cuenta:
        cliente.estado_cuenta === 'bloqueada' ? 'activa' : cliente.estado_cuenta,
    },
  });

  // Create audit log entry
  await prisma.log_auditoria.create({
    data: {
      accion: 'DESBLOQUEO_CUENTA',
      entidad: 'clientes',
      entidad_id: clienteId,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: datosAnteriores,
      datos_nuevos: {
        intentos_fallidos: 0,
        bloqueado_hasta: null,
        estado_cuenta: 'activa',
      },
    },
  });

  return {
    message: 'Cuenta desbloqueada exitosamente',
    clienteId: clienteId.toString(),
  };
}

/**
 * Get customer by ID for admin view
 * Returns basic customer info for admin panel
 */
export async function getCustomerById(clienteId: bigint) {
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      rut: true,
      numero_cliente: true,
      primer_nombre: true,
      segundo_nombre: true,
      primer_apellido: true,
      segundo_apellido: true,
      correo: true,
      telefono: true,
      estado_cuenta: true,
      intentos_fallidos: true,
      bloqueado_hasta: true,
      ultimo_inicio_sesion: true,
    },
  });

  if (!cliente) {
    return null;
  }

  // Build full name
  const nombre = [
    cliente.primer_nombre,
    cliente.segundo_nombre,
    cliente.primer_apellido,
    cliente.segundo_apellido,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    id: cliente.id.toString(),
    rut: cliente.rut,
    numeroCliente: cliente.numero_cliente,
    nombre,
    email: cliente.correo,
    telefono: cliente.telefono,
    estadoCuenta: cliente.estado_cuenta,
    intentosFallidos: cliente.intentos_fallidos,
    bloqueadoHasta: cliente.bloqueado_hasta,
    ultimoInicioSesion: cliente.ultimo_inicio_sesion,
    estaBloqueado:
      cliente.bloqueado_hasta !== null &&
      cliente.bloqueado_hasta > new Date(),
  };
}

