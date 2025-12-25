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
  search?: string
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

  const [cortes, total] = await Promise.all([
    prisma.cortes_servicio.findMany({
      where,
      orderBy: { created_at: 'desc' },
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
  const cliente = await prisma.clientes.findUnique({ where: { id: BigInt(data.clienteId) } });
  if (!cliente) throw new Error('Cliente no encontrado');

  const c = await prisma.cortes_servicio.create({
    data: {
      cliente_id: BigInt(data.clienteId),
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
        clienteId: data.clienteId,
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
      datos_anteriores: { motivo: existing.motivo_corte },
      datos_nuevos: { motivo: c.motivo_corte },
    },
  });

  return transformCorte(c);
}

export async function autorizarReposicion(id: bigint, adminEmail: string, numeroReposicion?: number) {
  const c = await prisma.cortes_servicio.findUnique({ where: { id } });
  if (!c) throw new Error('Corte no encontrado');
  if (c.estado === 'repuesto') throw new Error('El servicio ya fue repuesto');

  const updated = await prisma.cortes_servicio.update({
    where: { id },
    data: {
      estado: 'repuesto',
      fecha_reposicion: new Date(),
      autorizado_reposicion_por: adminEmail,
      numero_reposicion: numeroReposicion || c.numero_reposicion,
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
      datos_nuevos: { estado: 'repuesto' },
    },
  });

  return transformCorte(updated);
}
