import prisma from '../lib/prisma.js';
import type { CreateSubsidioInput, UpdateSubsidioInput } from '../schemas/subsidios.schema.js';

/**
 * Transform subsidio from database to API response format
 */
function transformSubsidio(subsidio: any) {
  return {
    id: subsidio.id,
    limiteM3: subsidio.limite_m3,
    porcentaje: Number(subsidio.porcentaje),
    fechaInicio: subsidio.fecha_inicio.toISOString().split('T')[0],
    fechaTermino: subsidio.fecha_termino?.toISOString().split('T')[0] || null,
    numeroDecreto: subsidio.numero_decreto,
    observaciones: subsidio.observaciones,
    estado: subsidio.estado,
    fechaCreacion: subsidio.fecha_creacion,
    esVigente: subsidio.estado === 'activo' && (!subsidio.fecha_termino || new Date(subsidio.fecha_termino) > new Date()),
  };
}

/**
 * Get all subsidios with pagination
 */
export async function getAllSubsidios(
  page: number = 1,
  limit: number = 50,
  sortBy: 'id' | 'porcentaje' | 'limiteM3' | 'fechaInicio' | 'estado' | 'cantidadHistorial' = 'fechaInicio',
  sortDirection: 'asc' | 'desc' = 'desc'
) {
  const skip = (page - 1) * limit;

  // For cantidadHistorial, we need to sort by a computed field - handle separately
  const needsManualSort = sortBy === 'cantidadHistorial';

  let orderBy: any;
  switch (sortBy) {
    case 'id':
      orderBy = { id: sortDirection };
      break;
    case 'porcentaje':
      orderBy = { porcentaje: sortDirection };
      break;
    case 'limiteM3':
      orderBy = { limite_m3: sortDirection };
      break;
    case 'estado':
      orderBy = { estado: sortDirection };
      break;
    case 'cantidadHistorial':
      // Will be sorted manually after fetching
      orderBy = { id: 'asc' };
      break;
    case 'fechaInicio':
    default:
      orderBy = { fecha_inicio: sortDirection };
      break;
  }

  // For cantidadHistorial sorting, fetch all and sort in memory (subsidios table is typically small)
  const [allSubsidios, total] = await Promise.all([
    prisma.subsidios.findMany({
      orderBy: needsManualSort ? undefined : orderBy,
      include: {
        _count: {
          select: { subsidio_historial: true },
        },
      },
    }),
    prisma.subsidios.count(),
  ]);

  // Transform and add cantidadHistorial
  let transformed = allSubsidios.map((s) => ({
    ...transformSubsidio(s),
    cantidadHistorial: s._count.subsidio_historial,
  }));

  // Sort by cantidadHistorial if needed
  if (needsManualSort) {
    transformed.sort((a, b) => {
      const diff = a.cantidadHistorial - b.cantidadHistorial;
      return sortDirection === 'asc' ? diff : -diff;
    });
  }

  // Apply pagination after sorting
  const paginated = transformed.slice(skip, skip + limit);

  return {
    subsidios: paginated,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get current active subsidios
 */
export async function getActiveSubsidios() {
  const subsidios = await prisma.subsidios.findMany({
    where: {
      estado: 'activo',
      fecha_inicio: { lte: new Date() },
      OR: [{ fecha_termino: null }, { fecha_termino: { gt: new Date() } }],
    },
    orderBy: { porcentaje: 'desc' },
  });

  return subsidios.map(transformSubsidio);
}

/**
 * Get a single subsidio by ID
 */
export async function getSubsidioById(id: number) {
  const subsidio = await prisma.subsidios.findUnique({
    where: { id },
    include: {
      _count: {
        select: { subsidio_historial: true },
      },
    },
  });

  if (!subsidio) {
    throw new Error('Subsidio no encontrado');
  }

  return {
    ...transformSubsidio(subsidio),
    cantidadHistorial: subsidio._count.subsidio_historial,
  };
}

/**
 * Create a new subsidio
 */
export async function createSubsidio(data: CreateSubsidioInput, adminEmail: string) {
  // Check for duplicate ID
  const existing = await prisma.subsidios.findUnique({
    where: { id: data.id },
  });

  if (existing) {
    throw new Error('Ya existe un subsidio con ese ID');
  }

  const subsidio = await prisma.subsidios.create({
    data: {
      id: data.id,
      limite_m3: data.limiteM3,
      porcentaje: data.porcentaje,
      fecha_inicio: new Date(data.fechaInicio),
      fecha_termino: data.fechaTermino ? new Date(data.fechaTermino) : null,
      numero_decreto: data.numeroDecreto || null,
      observaciones: data.observaciones || null,
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'CREAR_SUBSIDIO',
      entidad: 'subsidios',
      entidad_id: BigInt(subsidio.id),
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: data,
    },
  });

  return transformSubsidio(subsidio);
}

/**
 * Update an existing subsidio
 */
export async function updateSubsidio(id: number, data: UpdateSubsidioInput, adminEmail: string) {
  const existing = await prisma.subsidios.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Subsidio no encontrado');
  }

  const datosAnteriores = transformSubsidio(existing);

  const subsidio = await prisma.subsidios.update({
    where: { id },
    data: {
      ...(data.limiteM3 !== undefined && { limite_m3: data.limiteM3 }),
      ...(data.porcentaje !== undefined && { porcentaje: data.porcentaje }),
      ...(data.fechaInicio !== undefined && { fecha_inicio: new Date(data.fechaInicio) }),
      ...(data.fechaTermino !== undefined && {
        fecha_termino: data.fechaTermino ? new Date(data.fechaTermino) : null,
      }),
      ...(data.numeroDecreto !== undefined && { numero_decreto: data.numeroDecreto }),
      ...(data.observaciones !== undefined && { observaciones: data.observaciones }),
      ...(data.estado !== undefined && { estado: data.estado }),
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'EDITAR_SUBSIDIO',
      entidad: 'subsidios',
      entidad_id: BigInt(subsidio.id),
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: datosAnteriores,
      datos_nuevos: transformSubsidio(subsidio),
    },
  });

  return transformSubsidio(subsidio);
}

/**
 * Delete a subsidio (only if no historial)
 */
export async function deleteSubsidio(id: number, adminEmail: string) {
  const existing = await prisma.subsidios.findUnique({
    where: { id },
    include: {
      _count: {
        select: { subsidio_historial: true },
      },
    },
  });

  if (!existing) {
    throw new Error('Subsidio no encontrado');
  }

  if (existing._count.subsidio_historial > 0) {
    throw new Error(
      `No se puede eliminar: hay ${existing._count.subsidio_historial} registros de historial asociados`
    );
  }

  await prisma.subsidios.delete({ where: { id } });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'ELIMINAR_SUBSIDIO',
      entidad: 'subsidios',
      entidad_id: BigInt(id),
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: transformSubsidio(existing),
    },
  });

  return { success: true, message: 'Subsidio eliminado correctamente' };
}

// =========================================================================
// Subsidio Historial (Client Assignments)
// =========================================================================

/**
 * Get the currently active subsidy for a client (if any)
 * A client can only have one active subsidy at a time.
 * Returns null if no active subsidy, or the active subsidy info.
 */
export async function getClienteActiveSubsidio(clienteId: bigint) {
  // Get all historial entries for this client, ordered by fecha_cambio desc
  const historialEntries = await prisma.subsidio_historial.findMany({
    where: { cliente_id: clienteId },
    orderBy: [{ fecha_cambio: 'desc' }, { fecha_creacion: 'desc' }],
    include: {
      subsidio: {
        select: { id: true, porcentaje: true, limite_m3: true },
      },
    },
  });

  if (historialEntries.length === 0) {
    return null;
  }

  // Group by subsidio_id and find the latest entry for each
  const latestBySubsidio = new Map<number, typeof historialEntries[0]>();
  for (const entry of historialEntries) {
    if (entry.subsidio_id && !latestBySubsidio.has(entry.subsidio_id)) {
      latestBySubsidio.set(entry.subsidio_id, entry);
    }
  }

  // Find any that is currently active (latest entry is 'agregado' or 'alta')
  for (const [subsidioId, entry] of latestBySubsidio) {
    if (entry.tipo_cambio === 'agregado' || entry.tipo_cambio === 'alta') {
      return {
        subsidioId,
        subsidio: entry.subsidio
          ? {
              id: entry.subsidio.id,
              porcentaje: Number(entry.subsidio.porcentaje),
              limiteM3: entry.subsidio.limite_m3,
            }
          : null,
        fechaInicio: entry.fecha_cambio,
      };
    }
  }

  return null;
}

/**
 * Check if a client is already dado de baja for a specific subsidy
 */
async function isClienteDadoDeBaja(clienteId: bigint, subsidioId: number): Promise<boolean> {
  // Get the latest entry for this client+subsidio combination
  const latestEntry = await prisma.subsidio_historial.findFirst({
    where: {
      cliente_id: clienteId,
      subsidio_id: subsidioId,
    },
    orderBy: [{ fecha_cambio: 'desc' }, { fecha_creacion: 'desc' }],
  });

  if (!latestEntry) {
    // No entries at all - not dado de baja (but also not assigned)
    return false;
  }

  // If latest entry is 'eliminado' or 'baja', they are already dado de baja
  return latestEntry.tipo_cambio === 'eliminado' || latestEntry.tipo_cambio === 'baja';
}

function transformHistorial(h: any) {
  return {
    id: h.id.toString(),
    clienteId: h.cliente_id.toString(),
    numeroCliente: h.numero_cliente,
    subsidioId: h.subsidio_id,
    fechaCambio: h.fecha_cambio?.toISOString().split('T')[0] || null,
    tipoCambio: h.tipo_cambio,
    detalles: h.detalles,
    fechaCreacion: h.fecha_creacion,
    cliente: h.cliente
      ? {
          id: h.cliente.id.toString(),
          numeroCliente: h.cliente.numero_cliente,
          nombre: `${h.cliente.primer_nombre} ${h.cliente.primer_apellido}`,
        }
      : null,
    subsidio: h.subsidio
      ? {
          id: h.subsidio.id,
          porcentaje: Number(h.subsidio.porcentaje),
          limiteM3: h.subsidio.limite_m3,
        }
      : null,
  };
}

/**
 * Get all subsidio historial entries with pagination and filters
 */
export async function getSubsidioHistorial(options: {
  page: number;
  limit: number;
  subsidioId?: number;
  tipoCambio?: string;
  search?: string;
  sortBy?: 'cliente' | 'subsidio' | 'fechaCambio' | 'tipoCambio';
  sortDirection?: 'asc' | 'desc';
}) {
  const skip = (options.page - 1) * options.limit;
  const sortDirection = options.sortDirection || 'desc';

  const where: any = {};

  if (options.subsidioId) {
    where.subsidio_id = options.subsidioId;
  }

  if (options.tipoCambio) {
    where.tipo_cambio = options.tipoCambio;
  }

  if (options.search) {
    where.OR = [
      { numero_cliente: { contains: options.search, mode: 'insensitive' } },
      {
        cliente: {
          OR: [
            { primer_nombre: { contains: options.search, mode: 'insensitive' } },
            { primer_apellido: { contains: options.search, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  // Build orderBy based on sortBy
  let orderBy: any;
  switch (options.sortBy) {
    case 'cliente':
      orderBy = { numero_cliente: sortDirection };
      break;
    case 'subsidio':
      orderBy = { subsidio: { porcentaje: sortDirection } };
      break;
    case 'tipoCambio':
      orderBy = { tipo_cambio: sortDirection };
      break;
    case 'fechaCambio':
    default:
      orderBy = { fecha_cambio: sortDirection };
      break;
  }

  const [historial, total] = await Promise.all([
    prisma.subsidio_historial.findMany({
      where,
      orderBy,
      skip,
      take: options.limit,
      include: {
        cliente: {
          select: {
            id: true,
            numero_cliente: true,
            primer_nombre: true,
            primer_apellido: true,
          },
        },
        subsidio: {
          select: {
            id: true,
            porcentaje: true,
            limite_m3: true,
          },
        },
      },
    }),
    prisma.subsidio_historial.count({ where }),
  ]);

  return {
    historial: historial.map(transformHistorial),
    pagination: {
      total,
      page: options.page,
      limit: options.limit,
      totalPages: Math.ceil(total / options.limit),
    },
  };
}

/**
 * Assign a client to a subsidio (create historial entry)
 * Throws error if client already has an active subsidy
 */
export async function assignSubsidioToClient(
  clienteId: bigint,
  subsidioId: number,
  adminEmail: string,
  fechaCambio?: Date
) {
  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId } });
  if (!cliente) throw new Error('Cliente no encontrado');

  const subsidio = await prisma.subsidios.findUnique({ where: { id: subsidioId } });
  if (!subsidio) throw new Error('Subsidio no encontrado');

  // Check if client already has an active subsidy
  const activeSubsidio = await getClienteActiveSubsidio(clienteId);
  if (activeSubsidio) {
    const error: any = new Error('CLIENTE_YA_TIENE_SUBSIDIO');
    error.currentSubsidio = activeSubsidio;
    error.clienteId = clienteId.toString();
    throw error;
  }

  const historial = await prisma.subsidio_historial.create({
    data: {
      cliente_id: clienteId,
      subsidio_id: subsidioId,
      numero_cliente: cliente.numero_cliente,
      tipo_cambio: 'agregado',
      detalles: `Asignado por ${adminEmail}`,
      fecha_cambio: fechaCambio ?? new Date(),
    },
    include: {
      cliente: {
        select: { id: true, numero_cliente: true, primer_nombre: true, primer_apellido: true },
      },
      subsidio: { select: { id: true, porcentaje: true, limite_m3: true } },
    },
  });

  await prisma.log_auditoria.create({
    data: {
      accion: 'ASIGNAR_SUBSIDIO',
      entidad: 'subsidio_historial',
      entidad_id: historial.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: { clienteId: clienteId.toString(), subsidioId },
    },
  });

  return transformHistorial(historial);
}

/**
 * Remove a client from subsidio (create baja entry)
 * Throws error if client is already dado de baja for this subsidy
 */
export async function removeSubsidioFromClient(
  clienteId: bigint,
  subsidioId: number,
  motivo: string,
  adminEmail: string,
  fechaCambio?: Date
) {
  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId } });
  if (!cliente) throw new Error('Cliente no encontrado');

  // Check if already dado de baja for this specific subsidy
  const alreadyBaja = await isClienteDadoDeBaja(clienteId, subsidioId);
  if (alreadyBaja) {
    throw new Error('El cliente ya fue dado de baja de este subsidio');
  }

  const historial = await prisma.subsidio_historial.create({
    data: {
      cliente_id: clienteId,
      subsidio_id: subsidioId,
      numero_cliente: cliente.numero_cliente,
      tipo_cambio: 'eliminado',
      detalles: motivo || `Removido por ${adminEmail}`,
      fecha_cambio: fechaCambio ?? new Date(),
    },
    include: {
      cliente: {
        select: { id: true, numero_cliente: true, primer_nombre: true, primer_apellido: true },
      },
      subsidio: { select: { id: true, porcentaje: true, limite_m3: true } },
    },
  });

  await prisma.log_auditoria.create({
    data: {
      accion: 'REMOVER_SUBSIDIO',
      entidad: 'subsidio_historial',
      entidad_id: historial.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: { clienteId: clienteId.toString(), subsidioId, motivo },
    },
  });

  return transformHistorial(historial);
}

/**
 * Reassign a client from one subsidy to another
 * This creates a 'eliminado' entry for the old subsidy and an 'agregado' entry for the new one
 */
export async function reassignClienteSubsidio(
  clienteId: bigint,
  newSubsidioId: number,
  fechaCambio: Date,
  adminEmail: string
) {
  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId } });
  if (!cliente) throw new Error('Cliente no encontrado');

  const newSubsidio = await prisma.subsidios.findUnique({ where: { id: newSubsidioId } });
  if (!newSubsidio) throw new Error('Subsidio nuevo no encontrado');

  // Get current active subsidy
  const activeSubsidio = await getClienteActiveSubsidio(clienteId);
  if (!activeSubsidio) {
    throw new Error('El cliente no tiene un subsidio activo para reasignar');
  }

  if (activeSubsidio.subsidioId === newSubsidioId) {
    throw new Error('El cliente ya tiene este subsidio asignado');
  }

  // Calculate dates:
  // Old subsidy ends on last day of selected month
  const lastDayOfMonth = new Date(fechaCambio.getFullYear(), fechaCambio.getMonth() + 1, 0);
  // New subsidy starts on first day of next month
  const firstDayNextMonth = new Date(fechaCambio.getFullYear(), fechaCambio.getMonth() + 1, 1);

  // Create both entries in a transaction
  const [bajaEntry, altaEntry] = await prisma.$transaction([
    // Create baja entry for old subsidy
    prisma.subsidio_historial.create({
      data: {
        cliente_id: clienteId,
        subsidio_id: activeSubsidio.subsidioId,
        numero_cliente: cliente.numero_cliente,
        tipo_cambio: 'eliminado',
        detalles: `Reasignado a subsidio ${newSubsidioId} por ${adminEmail}`,
        fecha_cambio: lastDayOfMonth,
      },
      include: {
        cliente: {
          select: { id: true, numero_cliente: true, primer_nombre: true, primer_apellido: true },
        },
        subsidio: { select: { id: true, porcentaje: true, limite_m3: true } },
      },
    }),
    // Create alta entry for new subsidy
    prisma.subsidio_historial.create({
      data: {
        cliente_id: clienteId,
        subsidio_id: newSubsidioId,
        numero_cliente: cliente.numero_cliente,
        tipo_cambio: 'agregado',
        detalles: `Reasignado desde subsidio ${activeSubsidio.subsidioId} por ${adminEmail}`,
        fecha_cambio: firstDayNextMonth,
      },
      include: {
        cliente: {
          select: { id: true, numero_cliente: true, primer_nombre: true, primer_apellido: true },
        },
        subsidio: { select: { id: true, porcentaje: true, limite_m3: true } },
      },
    }),
  ]);

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'REASIGNAR_SUBSIDIO',
      entidad: 'subsidio_historial',
      entidad_id: altaEntry.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: {
        clienteId: clienteId.toString(),
        subsidioAnteriorId: activeSubsidio.subsidioId,
      },
      datos_nuevos: {
        clienteId: clienteId.toString(),
        subsidioNuevoId: newSubsidioId,
        fechaBaja: lastDayOfMonth.toISOString(),
        fechaAlta: firstDayNextMonth.toISOString(),
      },
    },
  });

  return {
    baja: transformHistorial(bajaEntry),
    alta: transformHistorial(altaEntry),
    oldSubsidioId: activeSubsidio.subsidioId,
    newSubsidioId,
  };
}

/**
 * Get current subsidy status for a client
 */
export async function getClientSubsidioStatus(clienteId: bigint) {
  // Get the most recent historial entry for each subsidio
  const historial = await prisma.subsidio_historial.findMany({
    where: { cliente_id: clienteId },
    orderBy: { fecha_cambio: 'desc' },
    include: {
      subsidio: true,
    },
  });

  // Group by subsidio and get latest entry
  const subsidioStatus = new Map<number, any>();
  for (const h of historial) {
    if (h.subsidio_id && !subsidioStatus.has(h.subsidio_id)) {
      subsidioStatus.set(h.subsidio_id, {
        subsidioId: h.subsidio_id,
        subsidio: h.subsidio
          ? {
              id: h.subsidio.id,
              porcentaje: Number(h.subsidio.porcentaje),
              limiteM3: h.subsidio.limite_m3,
            }
          : null,
        ultimoCambio: h.tipo_cambio,
        fechaCambio: h.fecha_cambio,
        activo: h.tipo_cambio === 'alta',
      });
    }
  }

  return Array.from(subsidioStatus.values());
}

/**
 * Update a subsidio historial entry (for correcting mistakes)
 */
export async function updateHistorialEntry(
  historialId: bigint,
  data: { fechaCambio?: Date; detalles?: string },
  adminEmail: string
) {
  // Get existing entry
  const existing = await prisma.subsidio_historial.findUnique({
    where: { id: historialId },
    include: {
      cliente: {
        select: { id: true, numero_cliente: true, primer_nombre: true, primer_apellido: true },
      },
      subsidio: { select: { id: true, porcentaje: true, limite_m3: true } },
    },
  });

  if (!existing) {
    throw new Error('Registro de historial no encontrado');
  }

  const updateData: any = {};
  if (data.fechaCambio !== undefined) {
    updateData.fecha_cambio = data.fechaCambio;
  }
  if (data.detalles !== undefined) {
    updateData.detalles = data.detalles;
  }

  const updated = await prisma.subsidio_historial.update({
    where: { id: historialId },
    data: updateData,
    include: {
      cliente: {
        select: { id: true, numero_cliente: true, primer_nombre: true, primer_apellido: true },
      },
      subsidio: { select: { id: true, porcentaje: true, limite_m3: true } },
    },
  });

  await prisma.log_auditoria.create({
    data: {
      accion: 'EDITAR_HISTORIAL_SUBSIDIO',
      entidad: 'subsidio_historial',
      entidad_id: historialId,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: {
        fechaCambio: existing.fecha_cambio?.toISOString(),
        detalles: existing.detalles,
      },
      datos_nuevos: {
        fechaCambio: updated.fecha_cambio?.toISOString(),
        detalles: updated.detalles,
      },
    },
  });

  return transformHistorial(updated);
}

/**
 * Delete a subsidio historial entry (for correcting mistakes, NOT for removing subsidy)
 */
export async function deleteHistorialEntry(historialId: bigint, adminEmail: string) {
  // Get existing entry for audit log
  const existing = await prisma.subsidio_historial.findUnique({
    where: { id: historialId },
    include: {
      cliente: {
        select: { id: true, numero_cliente: true, primer_nombre: true, primer_apellido: true },
      },
      subsidio: { select: { id: true, porcentaje: true, limite_m3: true } },
    },
  });

  if (!existing) {
    throw new Error('Registro de historial no encontrado');
  }

  // Delete the entry
  await prisma.subsidio_historial.delete({
    where: { id: historialId },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'ELIMINAR_HISTORIAL_SUBSIDIO',
      entidad: 'subsidio_historial',
      entidad_id: historialId,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: {
        clienteId: existing.cliente_id?.toString(),
        subsidioId: existing.subsidio_id,
        tipoCambio: existing.tipo_cambio,
        fechaCambio: existing.fecha_cambio?.toISOString(),
        detalles: existing.detalles,
      },
    },
  });

  return { success: true };
}
