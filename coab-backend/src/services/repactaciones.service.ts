import prisma from '../lib/prisma.js';

function transformRepactacion(r: any) {
  return {
    id: r.id.toString(),
    numeroConvenio: r.numero_convenio,
    clienteId: r.cliente_id?.toString(),
    numeroCliente: r.numero_cliente,
    montoDeudaInicial: Number(r.monto_deuda_inicial),
    totalCuotas: r.total_cuotas,
    montoCuotaInicial: Number(r.monto_cuota_inicial),
    montoCuotaBase: Number(r.monto_cuota_base),
    fechaInicio: r.fecha_inicio?.toISOString().split('T')[0] || null,
    fechaTerminoReal: r.fecha_termino_real?.toISOString().split('T')[0] || null,
    estado: r.estado,
    observaciones: r.observaciones,
    fechaCreacion: r.fecha_creacion,
    cliente: r.cliente ? {
      id: r.cliente.id.toString(),
      numeroCliente: r.cliente.numero_cliente,
      nombre: `${r.cliente.primer_nombre} ${r.cliente.primer_apellido}`,
    } : null,
  };
}

export async function getAllRepactaciones(page: number = 1, limit: number = 50, estado?: string) {
  const skip = (page - 1) * limit;
  const where = estado ? { estado } : {};
  const [repactaciones, total] = await Promise.all([
    prisma.repactaciones.findMany({
      where, orderBy: { fecha_creacion: 'desc' }, skip, take: limit,
      include: { cliente: { select: { id: true, numero_cliente: true, primer_nombre: true, primer_apellido: true } } },
    }),
    prisma.repactaciones.count({ where }),
  ]);
  return { repactaciones: repactaciones.map(transformRepactacion), pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function getRepactacionById(id: bigint) {
  const r = await prisma.repactaciones.findUnique({ where: { id }, include: { cliente: true, boletas: { orderBy: { fecha_emision: 'desc' }, take: 12 } } });
  if (!r) throw new Error('Repactación no encontrada');
  return {
    ...transformRepactacion(r),
    boletas: r.boletas.map(b => ({ id: b.id.toString(), periodoDesde: b.periodo_desde, periodoHasta: b.periodo_hasta, monto: Number(b.monto_total), estado: b.estado })),
  };
}

export async function getRepactacionesByCliente(clienteId: bigint) {
  const repactaciones = await prisma.repactaciones.findMany({ where: { cliente_id: clienteId }, orderBy: { fecha_creacion: 'desc' } });
  return repactaciones.map(transformRepactacion);
}

export async function createRepactacion(data: any, adminEmail: string) {
  const cliente = await prisma.clientes.findUnique({ where: { id: BigInt(data.clienteId) } });
  if (!cliente) throw new Error('Cliente no encontrado');

  const r = await prisma.repactaciones.create({
    data: {
      cliente_id: BigInt(data.clienteId),
      numero_cliente: cliente.numero_cliente,
      numero_convenio: data.numeroConvenio || null,
      monto_deuda_inicial: data.montoDeudaInicial,
      total_cuotas: data.totalCuotas,
      monto_cuota_inicial: data.montoCuotaInicial || data.montoDeudaInicial / data.totalCuotas,
      monto_cuota_base: data.montoCuotaBase || data.montoDeudaInicial / data.totalCuotas,
      fecha_inicio: new Date(data.fechaInicio),
      observaciones: data.observaciones || null,
    },
    include: { cliente: true },
  });

  await prisma.log_auditoria.create({
    data: { accion: 'CREAR_REPACTACION', entidad: 'repactaciones', entidad_id: r.id, usuario_tipo: 'admin', usuario_email: adminEmail, datos_nuevos: { clienteId: data.clienteId, monto: data.montoDeudaInicial, cuotas: data.totalCuotas } },
  });

  return transformRepactacion(r);
}

export async function updateRepactacion(id: bigint, data: any, adminEmail: string) {
  const existing = await prisma.repactaciones.findUnique({ where: { id } });
  if (!existing) throw new Error('Repactación no encontrada');

  const r = await prisma.repactaciones.update({
    where: { id },
    data: {
      ...(data.numeroConvenio !== undefined && { numero_convenio: data.numeroConvenio }),
      ...(data.observaciones !== undefined && { observaciones: data.observaciones }),
      ...(data.estado !== undefined && { estado: data.estado }),
      ...(data.fechaTerminoReal !== undefined && { fecha_termino_real: data.fechaTerminoReal ? new Date(data.fechaTerminoReal) : null }),
      fecha_actualizacion: new Date(),
    },
    include: { cliente: true },
  });

  await prisma.log_auditoria.create({
    data: { accion: 'EDITAR_REPACTACION', entidad: 'repactaciones', entidad_id: id, usuario_tipo: 'admin', usuario_email: adminEmail, datos_anteriores: { estado: existing.estado }, datos_nuevos: { estado: r.estado } },
  });

  return transformRepactacion(r);
}

export async function cancelRepactacion(id: bigint, adminEmail: string) {
  const existing = await prisma.repactaciones.findUnique({ where: { id } });
  if (!existing) throw new Error('Repactación no encontrada');
  if (existing.estado === 'cancelado') throw new Error('La repactación ya está cancelada');

  await prisma.repactaciones.update({ where: { id }, data: { estado: 'cancelado', fecha_actualizacion: new Date() } });

  await prisma.log_auditoria.create({
    data: { accion: 'CANCELAR_REPACTACION', entidad: 'repactaciones', entidad_id: id, usuario_tipo: 'admin', usuario_email: adminEmail, datos_anteriores: { estado: existing.estado }, datos_nuevos: { estado: 'cancelado' } },
  });

  return { success: true, message: 'Repactación cancelada' };
}

// Solicitudes de repactación (customer requests)
export async function getAllSolicitudes(page: number = 1, limit: number = 50, estado?: string) {
  const skip = (page - 1) * limit;
  const where = estado ? { estado } : {};
  const [solicitudes, total] = await Promise.all([
    prisma.solicitudes_repactacion.findMany({
      where, orderBy: { creado_en: 'desc' }, skip, take: limit,
      include: { cliente: { select: { id: true, numero_cliente: true, primer_nombre: true, primer_apellido: true } } },
    }),
    prisma.solicitudes_repactacion.count({ where }),
  ]);
  return {
    solicitudes: solicitudes.map(s => ({
      id: s.id.toString(),
      clienteId: s.cliente_id.toString(),
      numeroCliente: s.numero_cliente,
      montoDeudaEstimado: Number(s.monto_deuda_estimado),
      cuotasSolicitadas: s.cuotas_solicitadas,
      motivo: s.motivo,
      estado: s.estado,
      revisadoPor: s.revisado_por,
      fechaRevision: s.fecha_revision,
      motivoRechazo: s.motivo_rechazo,
      repactacionId: s.repactacion_id?.toString(),
      creadoEn: s.creado_en,
      cliente: s.cliente ? { id: s.cliente.id.toString(), numeroCliente: s.cliente.numero_cliente, nombre: `${s.cliente.primer_nombre} ${s.cliente.primer_apellido}` } : null,
    })),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function approveSolicitud(solicitudId: bigint, adminEmail: string) {
  const sol = await prisma.solicitudes_repactacion.findUnique({ where: { id: solicitudId }, include: { cliente: true } });
  if (!sol) throw new Error('Solicitud no encontrada');
  if (sol.estado !== 'pendiente') throw new Error('La solicitud ya fue procesada');

  // Create repactacion
  const r = await prisma.repactaciones.create({
    data: {
      cliente_id: sol.cliente_id,
      numero_cliente: sol.numero_cliente,
      monto_deuda_inicial: sol.monto_deuda_estimado,
      total_cuotas: sol.cuotas_solicitadas,
      monto_cuota_inicial: Number(sol.monto_deuda_estimado) / sol.cuotas_solicitadas,
      monto_cuota_base: Number(sol.monto_deuda_estimado) / sol.cuotas_solicitadas,
      fecha_inicio: new Date(),
      observaciones: `Aprobada desde solicitud ${solicitudId}. Motivo cliente: ${sol.motivo || 'No especificado'}`,
    },
  });

  // Update solicitud
  await prisma.solicitudes_repactacion.update({
    where: { id: solicitudId },
    data: { estado: 'aprobada', revisado_por: adminEmail, fecha_revision: new Date(), repactacion_id: r.id },
  });

  await prisma.log_auditoria.create({
    data: { accion: 'APROBAR_SOLICITUD_REPACTACION', entidad: 'solicitudes_repactacion', entidad_id: solicitudId, usuario_tipo: 'admin', usuario_email: adminEmail, datos_nuevos: { repactacionId: r.id.toString() } },
  });

  return { success: true, message: 'Solicitud aprobada', repactacionId: r.id.toString() };
}

export async function rejectSolicitud(solicitudId: bigint, motivoRechazo: string, adminEmail: string) {
  const sol = await prisma.solicitudes_repactacion.findUnique({ where: { id: solicitudId } });
  if (!sol) throw new Error('Solicitud no encontrada');
  if (sol.estado !== 'pendiente') throw new Error('La solicitud ya fue procesada');

  await prisma.solicitudes_repactacion.update({
    where: { id: solicitudId },
    data: { estado: 'rechazada', revisado_por: adminEmail, fecha_revision: new Date(), motivo_rechazo: motivoRechazo },
  });

  await prisma.log_auditoria.create({
    data: { accion: 'RECHAZAR_SOLICITUD_REPACTACION', entidad: 'solicitudes_repactacion', entidad_id: solicitudId, usuario_tipo: 'admin', usuario_email: adminEmail, datos_nuevos: { motivoRechazo } },
  });

  return { success: true, message: 'Solicitud rechazada' };
}


