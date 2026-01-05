import prisma from '../lib/prisma.js';

function transformCorte(c: any) {
  return {
    id: c.id.toString(),
    clienteId: c.cliente_id.toString(),
    numeroCliente: c.numero_cliente,
    fechaCorte: c.fecha_corte?.toISOString().split('T')[0] || null,
    fechaReposicion: c.fecha_reposicion?.toISOString().split('T')[0] || null,
    motivoCorte: c.motivo_corte,
    estado: c.estado,
    numeroReposicion: c.numero_reposicion,
    montoCobrado: c.monto_cobrado ? Number(c.monto_cobrado) : null,
    afectoIva: c.afecto_iva,
    autorizadoCortePor: c.autorizado_corte_por,
    autorizadoReposicionPor: c.autorizado_reposicion_por,
    observaciones: c.observaciones,
    boletaAplicadaId: c.boleta_aplicada_id?.toString() || null,
    fechaCreacion: c.created_at,
    cliente: c.clientes
      ? {
          id: c.clientes.id.toString(),
          numeroCliente: c.clientes.numero_cliente,
          nombre: `${c.clientes.primer_nombre} ${c.clientes.primer_apellido}`,
        }
      : null,
  };
}

export async function getAllCortes(
  page: number = 1,
  limit: number = 50,
  estado?: string,
  search?: string,
  sortBy: 'numeroCliente' | 'fechaCorte' | 'estado' | 'fechaReposicion' = 'fechaCorte',
  sortDirection: 'asc' | 'desc' = 'desc'
) {
  const skip = (page - 1) * limit;

  const where: any = {};
  if (estado) {
    where.estado = estado;
  }
  if (search) {
    where.OR = [
      { numero_cliente: { contains: search, mode: 'insensitive' } },
      {
        clientes: {
          OR: [
            { primer_nombre: { contains: search, mode: 'insensitive' } },
            { primer_apellido: { contains: search, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  // Build orderBy based on sortBy parameter
  let orderBy: any;
  switch (sortBy) {
    case 'numeroCliente':
      orderBy = { numero_cliente: sortDirection };
      break;
    case 'estado':
      orderBy = { estado: sortDirection };
      break;
    case 'fechaReposicion':
      orderBy = { fecha_reposicion: sortDirection };
      break;
    case 'fechaCorte':
    default:
      orderBy = { fecha_corte: sortDirection };
      break;
  }

  const [cortes, total] = await Promise.all([
    prisma.cortes_servicio.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        clientes: {
          select: {
            id: true,
            numero_cliente: true,
            primer_nombre: true,
            primer_apellido: true,
          },
        },
      },
    }),
    prisma.cortes_servicio.count({ where }),
  ]);

  return {
    cortes: cortes.map(transformCorte),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getCorteById(id: bigint) {
  const c = await prisma.cortes_servicio.findUnique({
    where: { id },
    include: { clientes: true },
  });
  if (!c) throw new Error('Corte no encontrado');
  return transformCorte(c);
}

export async function getCortesByCliente(clienteId: bigint) {
  const cortes = await prisma.cortes_servicio.findMany({
    where: { cliente_id: clienteId },
    orderBy: { created_at: 'desc' },
  });
  return cortes.map(transformCorte);
}

export async function createCorte(data: any, adminEmail: string) {
  // Look up client by numero_cliente
  const cliente = await prisma.clientes.findFirst({ where: { numero_cliente: data.numeroCliente } });
  if (!cliente) throw new Error('Cliente no encontrado');

  const c = await prisma.cortes_servicio.create({
    data: {
      cliente_id: cliente.id,
      numero_cliente: cliente.numero_cliente,
      fecha_corte: data.fechaCorte ? new Date(data.fechaCorte) : new Date(),
      motivo_corte: data.motivoCorte,
      autorizado_corte_por: adminEmail,
      observaciones: data.observaciones || null,
      monto_cobrado: data.montoCobrado || null,
      afecto_iva: data.afectoIva ?? true,
    },
    include: { clientes: true },
  });

  await prisma.log_auditoria.create({
    data: {
      accion: 'CREAR_CORTE',
      entidad: 'cortes_servicio',
      entidad_id: c.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: {
        numeroCliente: data.numeroCliente,
        motivo: data.motivoCorte,
      },
    },
  });

  return transformCorte(c);
}

export async function updateCorte(id: bigint, data: any, adminEmail: string) {
  const existing = await prisma.cortes_servicio.findUnique({ where: { id } });
  if (!existing) throw new Error('Corte no encontrado');

  const c = await prisma.cortes_servicio.update({
    where: { id },
    data: {
      ...(data.fechaCorte !== undefined && { fecha_corte: new Date(data.fechaCorte) }),
      ...(data.motivoCorte !== undefined && { motivo_corte: data.motivoCorte }),
      ...(data.observaciones !== undefined && { observaciones: data.observaciones }),
      ...(data.montoCobrado !== undefined && { monto_cobrado: data.montoCobrado }),
      updated_at: new Date(),
    },
    include: { clientes: true },
  });

  await prisma.log_auditoria.create({
    data: {
      accion: 'EDITAR_CORTE',
      entidad: 'cortes_servicio',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: { 
        fechaCorte: existing.fecha_corte,
        motivo: existing.motivo_corte,
        montoCobrado: existing.monto_cobrado ? Number(existing.monto_cobrado) : null,
      },
      datos_nuevos: { 
        fechaCorte: c.fecha_corte,
        motivo: c.motivo_corte,
        montoCobrado: c.monto_cobrado ? Number(c.monto_cobrado) : null,
      },
    },
  });

  return transformCorte(c);
}

export async function deleteCorte(id: bigint, adminEmail: string) {
  const existing = await prisma.cortes_servicio.findUnique({ where: { id } });
  if (!existing) throw new Error('Corte no encontrado');

  await prisma.cortes_servicio.delete({ where: { id } });

  await prisma.log_auditoria.create({
    data: {
      accion: 'ELIMINAR_CORTE',
      entidad: 'cortes_servicio',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: {
        clienteId: existing.cliente_id?.toString(),
        numeroCliente: existing.numero_cliente,
        fechaCorte: existing.fecha_corte,
        motivo: existing.motivo_corte,
        estado: existing.estado,
      },
      datos_nuevos: null,
    },
  });

  return { success: true, message: 'Corte eliminado' };
}

export async function autorizarReposicion(id: bigint, adminEmail: string, numeroReposicion?: number) {
  const c = await prisma.cortes_servicio.findUnique({ where: { id } });
  if (!c) throw new Error('Corte no encontrado');
  if (c.estado === 'repuesto') throw new Error('El servicio ya fue repuesto');

  // If numeroReposicion not provided, calculate based on client's history
  let reposicionNumber = numeroReposicion;
  if (!reposicionNumber) {
    // Count previous reposiciones for this client
    const previousCount = await prisma.cortes_servicio.count({
      where: {
        cliente_id: c.cliente_id,
        estado: 'repuesto',
        id: { not: id }, // Exclude current record
      },
    });
    // Reposicion 1 for first time, Reposicion 2 for subsequent
    reposicionNumber = previousCount >= 1 ? 2 : 1;
  }

  const updated = await prisma.cortes_servicio.update({
    where: { id },
    data: {
      estado: 'repuesto',
      fecha_reposicion: new Date(),
      autorizado_reposicion_por: adminEmail,
      numero_reposicion: reposicionNumber,
      updated_at: new Date(),
    },
    include: { clientes: true },
  });

  await prisma.log_auditoria.create({
    data: {
      accion: 'REPOSICION_SERVICIO',
      entidad: 'cortes_servicio',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: { estado: c.estado },
      datos_nuevos: { estado: 'repuesto', numeroReposicion: reposicionNumber },
    },
  });

  return transformCorte(updated);
}

/**
 * Get reposicion info for a client (count of previous reposiciones and tarifa values)
 */
export async function getClienteReposicionInfo(clienteId: bigint) {
  // Count previous reposiciones
  const previousCount = await prisma.cortes_servicio.count({
    where: {
      cliente_id: clienteId,
      estado: 'repuesto',
    },
  });

  // Get current tarifa
  const tarifa = await prisma.tarifas.findFirst({
    where: {
      fecha_inicio: { lte: new Date() },
    },
    orderBy: { fecha_inicio: 'desc' },
  });

  return {
    reposicionesPrevias: previousCount,
    siguienteNumeroReposicion: previousCount >= 1 ? 2 : 1,
    tarifaReposicion1: tarifa?.costo_reposicion_1 ? Number(tarifa.costo_reposicion_1) : 0,
    tarifaReposicion2: tarifa?.costo_reposicion_2 ? Number(tarifa.costo_reposicion_2) : 0,
  };
}
