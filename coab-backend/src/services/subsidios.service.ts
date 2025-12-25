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
export async function getAllSubsidios(page: number = 1, limit: number = 50) {
  const skip = (page - 1) * limit;

  const [subsidios, total] = await Promise.all([
    prisma.subsidios.findMany({
      orderBy: { fecha_inicio: 'desc' },
      skip,
      take: limit,
      include: {
        _count: {
          select: { subsidio_historial: true },
        },
      },
    }),
    prisma.subsidios.count(),
  ]);

  return {
    subsidios: subsidios.map((s) => ({
      ...transformSubsidio(s),
      cantidadHistorial: s._count.subsidio_historial,
    })),
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
}) {
  const skip = (options.page - 1) * options.limit;

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

  const [historial, total] = await Promise.all([
    prisma.subsidio_historial.findMany({
      where,
      orderBy: { fecha_cambio: 'desc' },
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
 */
export async function assignSubsidioToClient(
  clienteId: bigint,
  subsidioId: number,
  adminEmail: string
) {
  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId } });
  if (!cliente) throw new Error('Cliente no encontrado');

  const subsidio = await prisma.subsidios.findUnique({ where: { id: subsidioId } });
  if (!subsidio) throw new Error('Subsidio no encontrado');

  const historial = await prisma.subsidio_historial.create({
    data: {
      cliente_id: clienteId,
      subsidio_id: subsidioId,
      numero_cliente: cliente.numero_cliente,
      tipo_cambio: 'alta',
      detalles: `Asignado por ${adminEmail}`,
      fecha_cambio: new Date(),
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
 */
export async function removeSubsidioFromClient(
  clienteId: bigint,
  subsidioId: number,
  motivo: string,
  adminEmail: string
) {
  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId } });
  if (!cliente) throw new Error('Cliente no encontrado');

  const historial = await prisma.subsidio_historial.create({
    data: {
      cliente_id: clienteId,
      subsidio_id: subsidioId,
      numero_cliente: cliente.numero_cliente,
      tipo_cambio: 'baja',
      detalles: motivo || `Removido por ${adminEmail}`,
      fecha_cambio: new Date(),
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
