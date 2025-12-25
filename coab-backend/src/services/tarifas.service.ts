import prisma from '../lib/prisma.js';
import type { CreateTarifaInput, UpdateTarifaInput } from '../schemas/tarifas.schema.js';

/**
 * Transform tarifa from database to API response format
 */
function transformTarifa(tarifa: any) {
  return {
    id: tarifa.id.toString(),
    costoDespacho: Number(tarifa.costo_despacho),
    costoReposicion1: Number(tarifa.costo_reposicion_1),
    costoReposicion2: Number(tarifa.costo_reposicion_2),
    costoM3Agua: Number(tarifa.costo_m3_agua),
    costoM3Alcantarillado: tarifa.costo_m3_alcantarillado
      ? Number(tarifa.costo_m3_alcantarillado)
      : null,
    costoM3Tratamiento: tarifa.costo_m3_tratamiento
      ? Number(tarifa.costo_m3_tratamiento)
      : null,
    costoM3AlcantarilladoTratamiento: tarifa.costo_m3_alcantarillado_tratamiento
      ? Number(tarifa.costo_m3_alcantarillado_tratamiento)
      : null,
    cargoFijo: Number(tarifa.cargo_fijo),
    tasaIva: Number(tarifa.tasa_iva),
    fechaInicio: tarifa.fecha_inicio.toISOString().split('T')[0],
    fechaFin: tarifa.fecha_fin?.toISOString().split('T')[0] || null,
    tasaInteresMensual: Number(tarifa.tasa_interes_mensual || 0),
    diasGraciaInteres: tarifa.dias_gracia_interes || 30,
    fechaCreacion: tarifa.fecha_creacion,
    esVigente: !tarifa.fecha_fin || new Date(tarifa.fecha_fin) > new Date(),
  };
}

/**
 * Get all tarifas with pagination
 */
export async function getAllTarifas(page: number = 1, limit: number = 50) {
  const skip = (page - 1) * limit;

  const [tarifas, total] = await Promise.all([
    prisma.tarifas.findMany({
      orderBy: { fecha_inicio: 'desc' },
      skip,
      take: limit,
    }),
    prisma.tarifas.count(),
  ]);

  return {
    tarifas: tarifas.map(transformTarifa),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get current active tarifa
 */
export async function getCurrentTarifa() {
  const tarifa = await prisma.tarifas.findFirst({
    where: {
      fecha_inicio: { lte: new Date() },
      OR: [{ fecha_fin: null }, { fecha_fin: { gt: new Date() } }],
    },
    orderBy: { fecha_inicio: 'desc' },
  });

  if (!tarifa) {
    return null;
  }

  return transformTarifa(tarifa);
}

/**
 * Get a single tarifa by ID
 */
export async function getTarifaById(id: bigint) {
  const tarifa = await prisma.tarifas.findUnique({
    where: { id },
  });

  if (!tarifa) {
    throw new Error('Tarifa no encontrada');
  }

  return transformTarifa(tarifa);
}

/**
 * Create a new tarifa
 */
export async function createTarifa(data: CreateTarifaInput, adminEmail: string) {
  const tarifa = await prisma.tarifas.create({
    data: {
      costo_despacho: data.costoDespacho,
      costo_reposicion_1: data.costoReposicion1,
      costo_reposicion_2: data.costoReposicion2,
      costo_m3_agua: data.costoM3Agua,
      costo_m3_alcantarillado_tratamiento: data.costoM3AlcantarilladoTratamiento || null,
      cargo_fijo: data.cargoFijo,
      tasa_iva: data.tasaIva,
      fecha_inicio: new Date(data.fechaInicio),
      fecha_fin: data.fechaFin ? new Date(data.fechaFin) : null,
      tasa_interes_mensual: data.tasaInteresMensual || 0,
      dias_gracia_interes: data.diasGraciaInteres || 30,
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'CREAR_TARIFA',
      entidad: 'tarifas',
      entidad_id: tarifa.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: data,
    },
  });

  return transformTarifa(tarifa);
}

/**
 * Update an existing tarifa
 */
export async function updateTarifa(id: bigint, data: UpdateTarifaInput, adminEmail: string) {
  const existing = await prisma.tarifas.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Tarifa no encontrada');
  }

  const datosAnteriores = transformTarifa(existing);

  const tarifa = await prisma.tarifas.update({
    where: { id },
    data: {
      ...(data.costoDespacho !== undefined && { costo_despacho: data.costoDespacho }),
      ...(data.costoReposicion1 !== undefined && { costo_reposicion_1: data.costoReposicion1 }),
      ...(data.costoReposicion2 !== undefined && { costo_reposicion_2: data.costoReposicion2 }),
      ...(data.costoM3Agua !== undefined && { costo_m3_agua: data.costoM3Agua }),
      ...(data.costoM3AlcantarilladoTratamiento !== undefined && {
        costo_m3_alcantarillado_tratamiento: data.costoM3AlcantarilladoTratamiento,
      }),
      ...(data.cargoFijo !== undefined && { cargo_fijo: data.cargoFijo }),
      ...(data.tasaIva !== undefined && { tasa_iva: data.tasaIva }),
      ...(data.fechaInicio !== undefined && { fecha_inicio: new Date(data.fechaInicio) }),
      ...(data.fechaFin !== undefined && {
        fecha_fin: data.fechaFin ? new Date(data.fechaFin) : null,
      }),
      ...(data.tasaInteresMensual !== undefined && { tasa_interes_mensual: data.tasaInteresMensual }),
      ...(data.diasGraciaInteres !== undefined && { dias_gracia_interes: data.diasGraciaInteres }),
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'EDITAR_TARIFA',
      entidad: 'tarifas',
      entidad_id: tarifa.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: datosAnteriores,
      datos_nuevos: transformTarifa(tarifa),
    },
  });

  return transformTarifa(tarifa);
}

/**
 * Delete a tarifa
 */
export async function deleteTarifa(id: bigint, adminEmail: string) {
  const existing = await prisma.tarifas.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Tarifa no encontrada');
  }

  // Check if this is the current active tarifa
  const current = await getCurrentTarifa();
  if (current && current.id === id.toString()) {
    throw new Error('No se puede eliminar la tarifa vigente');
  }

  await prisma.tarifas.delete({ where: { id } });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'ELIMINAR_TARIFA',
      entidad: 'tarifas',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: transformTarifa(existing),
    },
  });

  return { success: true, message: 'Tarifa eliminada correctamente' };
}


