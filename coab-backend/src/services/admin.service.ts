import prisma from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Helper to build full name from parts
 */
function buildFullName(
  primerNombre: string,
  segundoNombre: string | null,
  primerApellido: string,
  segundoApellido: string | null
): string {
  return [primerNombre, segundoNombre, primerApellido, segundoApellido]
    .filter(Boolean)
    .join(' ');
}

/**
 * Search customers by RUT, name parts, numero_cliente, or address
 * Uses case-insensitive matching
 */
export async function searchCustomers(
  query: string,
  limit: number = 50,
  cursor?: string
) {
  // Sanitize query (remove special regex chars)
  const sanitizedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build search conditions for name parts
  const searchConditions = [
    { rut: { contains: sanitizedQuery, mode: 'insensitive' as const } },
    { numero_cliente: { contains: sanitizedQuery, mode: 'insensitive' as const } },
    { primer_nombre: { contains: sanitizedQuery, mode: 'insensitive' as const } },
    { segundo_nombre: { contains: sanitizedQuery, mode: 'insensitive' as const } },
    { primer_apellido: { contains: sanitizedQuery, mode: 'insensitive' as const } },
    { segundo_apellido: { contains: sanitizedQuery, mode: 'insensitive' as const } },
  ];

  const customers = await prisma.clientes.findMany({
    where: {
      es_cliente_actual: true,
      OR: searchConditions,
    },
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { primer_apellido: 'asc' },
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
      bloqueado_hasta: true,
      direcciones: {
        take: 1,
        select: {
          direccion_calle: true,
          direccion_numero: true,
          poblacion: true,
        },
      },
    },
  });

  const hasNextPage = customers.length > limit;
  const data = hasNextPage ? customers.slice(0, -1) : customers;
  const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

  // Batch query: Get all saldos in a single query (avoids N+1)
  const customerIds = data.map((c) => c.id);
  const saldosGrouped = await prisma.boletas.groupBy({
    by: ['cliente_id'],
    where: {
      cliente_id: { in: customerIds },
      estado: 'pendiente',
    },
    _sum: {
      monto_total: true,
    },
  });

  // Create a map for quick lookup
  const saldoMap = new Map<bigint, number>();
  for (const row of saldosGrouped) {
    if (row.cliente_id !== null) {
      saldoMap.set(row.cliente_id, Number(row._sum.monto_total || 0));
    }
  }

  // Transform data with saldos from the map
  const customersWithSaldo = data.map((customer) => {
    const saldo = saldoMap.get(customer.id) || 0;
    const direccion = customer.direcciones[0];
    const direccionStr = direccion
      ? `${direccion.direccion_calle} ${direccion.direccion_numero || ''}, ${direccion.poblacion}`.trim()
      : null;

    return {
      id: customer.id.toString(),
      rut: customer.rut,
      numeroCliente: customer.numero_cliente,
      nombre: buildFullName(
        customer.primer_nombre,
        customer.segundo_nombre,
        customer.primer_apellido,
        customer.segundo_apellido
      ),
      direccion: direccionStr,
      telefono: customer.telefono,
      email: customer.correo,
      saldo,
      estadoCuenta: saldo > 0 ? 'MOROSO' : 'AL_DIA',
      estaBloqueado:
        customer.bloqueado_hasta !== null &&
        customer.bloqueado_hasta > new Date(),
    };
  });

  return {
    data: customersWithSaldo,
    pagination: {
      hasNextPage,
      nextCursor,
      total: customersWithSaldo.length,
    },
  };
}

/**
 * Get full customer profile for admin view
 * Includes computed saldo and address
 */
export async function getCustomerProfile(clienteId: bigint) {
  const customer = await prisma.clientes.findUnique({
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
      bloqueado_hasta: true,
      intentos_fallidos: true,
      hash_contrasena: true,
      ultimo_inicio_sesion: true,
      fecha_creacion: true,
      es_cliente_actual: true,
      direcciones: {
        take: 1,
        select: {
          direccion_calle: true,
          direccion_numero: true,
          poblacion: true,
          comuna: true,
        },
      },
    },
  });

  if (!customer) {
    throw new Error('Cliente no encontrado');
  }

  // Calculate real-time balance from pending boletas
  const saldoResult = await prisma.boletas.aggregate({
    where: {
      cliente_id: clienteId,
      estado: 'pendiente',
    },
    _sum: {
      monto_total: true,
    },
  });

  const saldo = Number(saldoResult._sum.monto_total || 0);
  const direccion = customer.direcciones[0];
  const direccionStr = direccion
    ? `${direccion.direccion_calle} ${direccion.direccion_numero || ''}, ${direccion.poblacion}, ${direccion.comuna}`.trim()
    : null;

  return {
    id: customer.id.toString(),
    rut: customer.rut,
    numeroCliente: customer.numero_cliente,
    nombre: buildFullName(
      customer.primer_nombre,
      customer.segundo_nombre,
      customer.primer_apellido,
      customer.segundo_apellido
    ),
    email: customer.correo,
    telefono: customer.telefono,
    direccion: direccionStr,
    saldo,
    estadoCuenta: saldo > 0 ? 'MOROSO' : 'AL_DIA',
    estaBloqueado:
      customer.bloqueado_hasta !== null &&
      customer.bloqueado_hasta > new Date(),
    bloqueadoHasta: customer.bloqueado_hasta,
    intentosFallidos: customer.intentos_fallidos,
    tieneContrasena: !!customer.hash_contrasena,
    ultimoInicioSesion: customer.ultimo_inicio_sesion,
    fechaCreacion: customer.fecha_creacion,
    esClienteActual: customer.es_cliente_actual,
  };
}

/**
 * Get customer payment history (admin view)
 */
export async function getCustomerPayments(
  clienteId: bigint,
  limit: number = 50,
  cursor?: string
) {
  const payments = await prisma.pagos.findMany({
    where: { cliente_id: clienteId },
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { fecha_pago: 'desc' },
    select: {
      id: true,
      monto: true,
      fecha_pago: true,
      tipo_pago: true,
      estado: true,
      numero_transaccion: true,
      operador: true,
      observaciones: true,
    },
  });

  const hasNextPage = payments.length > limit;
  const data = hasNextPage ? payments.slice(0, -1) : payments;
  const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

  return {
    data: data.map((p) => ({
      id: p.id.toString(),
      monto: Number(p.monto),
      fechaPago: p.fecha_pago,
      tipoPago: p.tipo_pago,
      estado: p.estado,
      numeroTransaccion: p.numero_transaccion,
      operador: p.operador,
      observaciones: p.observaciones,
    })),
    pagination: { hasNextPage, nextCursor },
  };
}

/**
 * Get customer boletas (admin view)
 */
export async function getCustomerBoletas(
  clienteId: bigint,
  limit: number = 50,
  cursor?: string
) {
  const boletas = await prisma.boletas.findMany({
    where: { cliente_id: clienteId },
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { fecha_emision: 'desc' },
    select: {
      id: true,
      numero_folio: true,
      periodo_desde: true,
      periodo_hasta: true,
      fecha_emision: true,
      fecha_vencimiento: true,
      monto_total: true,
      estado: true,
      consumo_m3: true,
    },
  });

  const hasNextPage = boletas.length > limit;
  const data = hasNextPage ? boletas.slice(0, -1) : boletas;
  const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

  return {
    data: data.map((b) => ({
      id: b.id.toString(),
      numeroFolio: b.numero_folio,
      periodoDesde: b.periodo_desde,
      periodoHasta: b.periodo_hasta,
      fechaEmision: b.fecha_emision,
      fechaVencimiento: b.fecha_vencimiento,
      montoTotal: Number(b.monto_total),
      estado: b.estado,
      consumoM3: b.consumo_m3 ? Number(b.consumo_m3) : null,
    })),
    pagination: { hasNextPage, nextCursor },
  };
}

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


