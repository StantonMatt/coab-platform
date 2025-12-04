import prisma from '../lib/prisma.js';
import { formatearPesos } from '@coab/utils';

/**
 * Build full name from cliente name parts
 */
function buildFullName(cliente: {
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
}): string {
  return [
    cliente.primer_nombre,
    cliente.segundo_nombre,
    cliente.primer_apellido,
    cliente.segundo_apellido,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Get customer profile by ID
 */
export async function getCustomerProfile(clienteId: bigint) {
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

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  const direccion = cliente.direcciones[0];

  return {
    id: cliente.id.toString(),
    rut: cliente.rut,
    numeroCliente: cliente.numero_cliente,
    nombre: buildFullName(cliente),
    email: cliente.correo,
    telefono: cliente.telefono,
    estadoCuenta: cliente.estado_cuenta,
    direccion: direccion
      ? `${direccion.direccion_calle} ${direccion.direccion_numero || ''}, ${direccion.poblacion}, ${direccion.comuna}`
      : null,
  };
}

/**
 * Calculate customer balance from pending boletas
 */
export async function getCustomerBalance(clienteId: bigint) {
  // Sum all pending boletas
  const result = await prisma.boletas.aggregate({
    where: {
      cliente_id: clienteId,
      estado: 'pendiente',
    },
    _sum: {
      monto_total: true,
    },
  });

  const saldo = result._sum.monto_total || 0;

  // Get earliest due date from pending boletas
  const nextBoleta = await prisma.boletas.findFirst({
    where: {
      cliente_id: clienteId,
      estado: 'pendiente',
    },
    orderBy: {
      fecha_vencimiento: 'asc',
    },
    select: {
      fecha_vencimiento: true,
    },
  });

  const saldoNumber = Number(saldo);

  return {
    saldo: saldoNumber,
    saldoFormateado: formatearPesos(saldoNumber),
    fechaVencimiento: nextBoleta?.fecha_vencimiento || null,
    estadoCuenta: saldoNumber > 0 ? 'MOROSO' : 'AL_DIA',
  };
}

/**
 * Get customer payments with cursor-based pagination
 */
export async function getCustomerPayments(
  clienteId: bigint,
  limit: number = 50,
  cursor?: string
) {
  const payments = await prisma.pagos.findMany({
    where: { cliente_id: clienteId },
    take: limit + 1,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { fecha_pago: 'desc' },
    select: {
      id: true,
      monto: true,
      fecha_pago: true,
      tipo_pago: true,
      estado: true,
      numero_transaccion: true,
      observaciones: true,
    },
  });

  const hasNextPage = payments.length > limit;
  const data = hasNextPage ? payments.slice(0, -1) : payments;
  const nextCursor = hasNextPage
    ? data[data.length - 1].id.toString()
    : null;

  return {
    data: data.map((p) => ({
      id: p.id.toString(),
      monto: Number(p.monto),
      fechaPago: p.fecha_pago,
      tipoPago: p.tipo_pago,
      estado: p.estado,
      numeroTransaccion: p.numero_transaccion,
      observaciones: p.observaciones,
    })),
    pagination: {
      hasNextPage,
      nextCursor,
    },
  };
}

/**
 * Get customer boletas with cursor-based pagination
 */
export async function getCustomerBoletas(
  clienteId: bigint,
  limit: number = 50,
  cursor?: string
) {
  const boletas = await prisma.boletas.findMany({
    where: { cliente_id: clienteId },
    take: limit + 1,
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
  const nextCursor = hasNextPage
    ? data[data.length - 1].id.toString()
    : null;

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
    pagination: {
      hasNextPage,
      nextCursor,
    },
  };
}

/**
 * Get single boleta by ID with security check
 * Customer can only see their own boletas
 */
export async function getBoletaById(clienteId: bigint, boletaId: bigint) {
  const boleta = await prisma.boletas.findFirst({
    where: {
      id: boletaId,
      cliente_id: clienteId, // Security: ensure customer owns this boleta
    },
  });

  if (!boleta) {
    throw new Error('Boleta no encontrada');
  }

  return {
    id: boleta.id.toString(),
    numeroFolio: boleta.numero_folio,
    periodoDesde: boleta.periodo_desde,
    periodoHasta: boleta.periodo_hasta,
    fechaEmision: boleta.fecha_emision,
    fechaVencimiento: boleta.fecha_vencimiento,
    estado: boleta.estado,
    // Amounts
    montoNeto: Number(boleta.monto_neto),
    montoIva: Number(boleta.monto_iva),
    montoSubsidio: Number(boleta.monto_subsidio),
    montoDescuento: boleta.monto_descuento ? Number(boleta.monto_descuento) : 0,
    montoInteres: boleta.monto_interes ? Number(boleta.monto_interes) : 0,
    montoTotal: Number(boleta.monto_total),
    montoSaldoAnterior: Number(boleta.monto_saldo_anterior),
    // Breakdown
    consumoM3: boleta.consumo_m3 ? Number(boleta.consumo_m3) : null,
    costoAgua: boleta.costo_agua ? Number(boleta.costo_agua) : null,
    costoAlcantarillado: boleta.costo_alcantarillado
      ? Number(boleta.costo_alcantarillado)
      : null,
    costoTratamiento: boleta.costo_tratamiento
      ? Number(boleta.costo_tratamiento)
      : null,
    costoCargoFijo: boleta.costo_cargo_fijo
      ? Number(boleta.costo_cargo_fijo)
      : null,
    // Other
    diasVencido: boleta.dias_vencido,
    observaciones: boleta.observaciones,
  };
}

/**
 * Get active system notifications (public endpoint)
 * Returns notifications that are active and within their date range
 */
export async function getActiveNotifications() {
  const now = new Date();

  const notifications = await prisma.notificaciones_sistema.findMany({
    where: {
      activo: true,
      desde: { lte: now },
      hasta: { gte: now },
    },
    orderBy: {
      creado_en: 'desc',
    },
    select: {
      id: true,
      mensaje: true,
      tipo: true,
      desde: true,
      hasta: true,
    },
  });

  return notifications.map((n) => ({
    id: n.id.toString(),
    mensaje: n.mensaje,
    tipo: n.tipo,
    desde: n.desde,
    hasta: n.hasta,
  }));
}


