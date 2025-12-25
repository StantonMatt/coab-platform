import prisma from '../lib/prisma.js';

function transformDescuento(d: any) {
  return {
    id: d.id.toString(),
    nombre: d.nombre,
    descripcion: d.descripcion,
    tipoDescuento: d.tipo_descuento,
    valor: Number(d.valor),
    fechaInicio: d.fecha_inicio?.toISOString().split('T')[0] || null,
    fechaFin: d.fecha_fin?.toISOString().split('T')[0] || null,
    activo: d.activo ?? true,
    aplicaCargoFijo: d.aplica_cargo_fijo ?? true,
    aplicaConsumo: d.aplica_consumo ?? true,
    consumoMinimo: d.consumo_minimo ? Number(d.consumo_minimo) : null,
    consumoMaximo: d.consumo_maximo ? Number(d.consumo_maximo) : null,
    creadoPor: d.creado_por,
    fechaCreacion: d.fecha_creacion,
    esVigente: (d.activo ?? true) && (!d.fecha_fin || new Date(d.fecha_fin) > new Date()),
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
      descripcion: data.descripcion || null,
      tipo_descuento: data.tipoDescuento || 'porcentaje',
      valor: data.valor,
      fecha_inicio: new Date(data.fechaInicio),
      fecha_fin: data.fechaFin ? new Date(data.fechaFin) : null,
      activo: data.activo ?? true,
      aplica_cargo_fijo: data.aplicaCargoFijo ?? true,
      aplica_consumo: data.aplicaConsumo ?? true,
      consumo_minimo: data.consumoMinimo ?? null,
      consumo_maximo: data.consumoMaximo ?? null,
      creado_por: adminEmail,
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
  
  const updateData: any = {};
  if (data.nombre !== undefined) updateData.nombre = data.nombre;
  if (data.descripcion !== undefined) updateData.descripcion = data.descripcion;
  if (data.tipoDescuento !== undefined) updateData.tipo_descuento = data.tipoDescuento;
  if (data.valor !== undefined) updateData.valor = data.valor;
  if (data.fechaInicio !== undefined) updateData.fecha_inicio = new Date(data.fechaInicio);
  if (data.fechaFin !== undefined) updateData.fecha_fin = data.fechaFin ? new Date(data.fechaFin) : null;
  if (data.activo !== undefined) updateData.activo = data.activo;
  if (data.aplicaCargoFijo !== undefined) updateData.aplica_cargo_fijo = data.aplicaCargoFijo;
  if (data.aplicaConsumo !== undefined) updateData.aplica_consumo = data.aplicaConsumo;
  if (data.consumoMinimo !== undefined) updateData.consumo_minimo = data.consumoMinimo;
  if (data.consumoMaximo !== undefined) updateData.consumo_maximo = data.consumoMaximo;
  updateData.fecha_actualizacion = new Date();

  const d = await prisma.descuentos.update({
    where: { id },
    data: updateData,
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
