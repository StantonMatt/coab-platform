import prisma from '../lib/prisma.js';

function transformDescuento(d: any) {
  return {
    id: d.id.toString(),
    nombre: d.nombre,
    porcentaje: Number(d.porcentaje),
    fechaInicio: d.fecha_inicio?.toISOString().split('T')[0] || null,
    fechaFin: d.fecha_fin?.toISOString().split('T')[0] || null,
    estado: d.estado,
    descripcion: d.descripcion,
    fechaCreacion: d.fecha_creacion,
    esVigente: d.estado === 'activo' && (!d.fecha_fin || new Date(d.fecha_fin) > new Date()),
  };
}

export async function getAllDescuentos(page: number = 1, limit: number = 50) {
  const skip = (page - 1) * limit;
  const [descuentos, total] = await Promise.all([
    prisma.descuentos.findMany({ orderBy: { fecha_creacion: 'desc' }, skip, take: limit }),
    prisma.descuentos.count(),
  ]);
  return {
    descuentos: descuentos.map(transformDescuento),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getDescuentoById(id: bigint) {
  const d = await prisma.descuentos.findUnique({ where: { id } });
  if (!d) throw new Error('Descuento no encontrado');
  return transformDescuento(d);
}

export async function createDescuento(data: any, adminEmail: string) {
  const d = await prisma.descuentos.create({
    data: {
      nombre: data.nombre,
      porcentaje: data.porcentaje,
      fecha_inicio: data.fechaInicio ? new Date(data.fechaInicio) : null,
      fecha_fin: data.fechaFin ? new Date(data.fechaFin) : null,
      descripcion: data.descripcion || null,
    },
  });
  await prisma.log_auditoria.create({
    data: { accion: 'CREAR_DESCUENTO', entidad: 'descuentos', entidad_id: d.id, usuario_tipo: 'admin', usuario_email: adminEmail, datos_nuevos: data },
  });
  return transformDescuento(d);
}

export async function updateDescuento(id: bigint, data: any, adminEmail: string) {
  const existing = await prisma.descuentos.findUnique({ where: { id } });
  if (!existing) throw new Error('Descuento no encontrado');
  const d = await prisma.descuentos.update({
    where: { id },
    data: {
      ...(data.nombre !== undefined && { nombre: data.nombre }),
      ...(data.porcentaje !== undefined && { porcentaje: data.porcentaje }),
      ...(data.fechaInicio !== undefined && { fecha_inicio: data.fechaInicio ? new Date(data.fechaInicio) : null }),
      ...(data.fechaFin !== undefined && { fecha_fin: data.fechaFin ? new Date(data.fechaFin) : null }),
      ...(data.descripcion !== undefined && { descripcion: data.descripcion }),
      ...(data.estado !== undefined && { estado: data.estado }),
    },
  });
  await prisma.log_auditoria.create({
    data: { accion: 'EDITAR_DESCUENTO', entidad: 'descuentos', entidad_id: id, usuario_tipo: 'admin', usuario_email: adminEmail, datos_anteriores: transformDescuento(existing), datos_nuevos: transformDescuento(d) },
  });
  return transformDescuento(d);
}

export async function deleteDescuento(id: bigint, adminEmail: string) {
  const existing = await prisma.descuentos.findUnique({ where: { id } });
  if (!existing) throw new Error('Descuento no encontrado');
  await prisma.descuentos.delete({ where: { id } });
  await prisma.log_auditoria.create({
    data: { accion: 'ELIMINAR_DESCUENTO', entidad: 'descuentos', entidad_id: id, usuario_tipo: 'admin', usuario_email: adminEmail, datos_anteriores: transformDescuento(existing) },
  });
  return { success: true, message: 'Descuento eliminado' };
}

export async function getDescuentosByCliente(clienteId: bigint) {
  const aplicados = await prisma.descuentos_aplicados.findMany({
    where: { cliente_id: clienteId },
    include: {
      descuento: true,
    },
    orderBy: { fecha_aplicacion: 'desc' },
  });

  return aplicados.map((a) => ({
    id: a.id.toString(),
    nombre: a.descuento?.nombre || 'Descuento eliminado',
    tipo: a.descuento?.tipo_descuento || 'N/A',
    valor: a.descuento ? Number(a.descuento.valor) : 0,
    fecha_aplicacion: a.fecha_aplicacion?.toISOString() || null,
    monto_aplicado: Number(a.monto_aplicado),
  }));
}

