import prisma from '../lib/prisma.js';

function transformMulta(multa: any) {
  // Estado is derived from cancelada_por field
  const estado = multa.cancelada_por ? 'cancelada' : 'activa';

  return {
    id: multa.id.toString(),
    clienteId: multa.cliente_id.toString(),
    monto: Number(multa.monto),
    motivo: multa.motivo,
    descripcion: multa.descripcion,
    fechaAplicacion: multa.fecha_aplicacion?.toISOString().split('T')[0] || null,
    periodoDesde: multa.periodo_desde?.toISOString().split('T')[0] || null,
    periodoHasta: multa.periodo_hasta?.toISOString().split('T')[0] || null,
    estado,
    afectoIva: multa.afecto_iva,
    aplicadaPor: multa.aplicada_por,
    canceladaPor: multa.cancelada_por,
    fechaCancelacion: multa.fecha_cancelacion,
    boletaAplicadaId: multa.boleta_aplicada_id?.toString() || null,
    fechaCreacion: multa.created_at,
    cliente: multa.cliente
      ? {
          id: multa.cliente.id.toString(),
          numeroCliente: multa.cliente.numero_cliente,
          nombre: `${multa.cliente.primer_nombre} ${multa.cliente.primer_apellido}`,
        }
      : null,
  };
}

export async function getAllMultas(
  page: number = 1,
  limit: number = 50,
  estado?: string,
  search?: string
) {
  const skip = (page - 1) * limit;

  const where: any = {};

  // Filter by estado (derived field)
  if (estado === 'activa') {
    where.cancelada_por = null;
  } else if (estado === 'cancelada') {
    where.cancelada_por = { not: null };
  }

  // Search by client
  if (search) {
    where.OR = [
      { motivo: { contains: search, mode: 'insensitive' } },
      {
        cliente: {
          OR: [
            { primer_nombre: { contains: search, mode: 'insensitive' } },
            { primer_apellido: { contains: search, mode: 'insensitive' } },
            { numero_cliente: { contains: search, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  const [multas, total] = await Promise.all([
    prisma.multas.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      include: {
        cliente: {
          select: {
            id: true,
            numero_cliente: true,
            primer_nombre: true,
            primer_apellido: true,
          },
        },
      },
    }),
    prisma.multas.count({ where }),
  ]);

  return {
    multas: multas.map(transformMulta),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getMultaById(id: bigint) {
  const multa = await prisma.multas.findUnique({
    where: { id },
    include: { cliente: true },
  });
  if (!multa) throw new Error('Multa no encontrada');
  return transformMulta(multa);
}

export async function getMultasByCliente(clienteId: bigint) {
  const multas = await prisma.multas.findMany({
    where: { cliente_id: clienteId },
    orderBy: { created_at: 'desc' },
  });
  return multas.map(transformMulta);
}

export async function createMulta(data: any, adminEmail: string) {
  const cliente = await prisma.clientes.findUnique({ where: { id: BigInt(data.clienteId) } });
  if (!cliente) throw new Error('Cliente no encontrado');

  const multa = await prisma.multas.create({
    data: {
      cliente_id: BigInt(data.clienteId),
      monto: data.monto,
      motivo: data.motivo,
      descripcion: data.descripcion || null,
      fecha_aplicacion: data.fechaAplicacion ? new Date(data.fechaAplicacion) : new Date(),
      periodo_desde: data.periodoDesde ? new Date(data.periodoDesde) : null,
      periodo_hasta: data.periodoHasta ? new Date(data.periodoHasta) : null,
      aplicada_por: adminEmail,
      afecto_iva: data.afectoIva ?? true,
    },
    include: { cliente: true },
  });

  await prisma.log_auditoria.create({
    data: {
      accion: 'CREAR_MULTA',
      entidad: 'multas',
      entidad_id: multa.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: {
        clienteId: data.clienteId,
        monto: data.monto,
        motivo: data.motivo,
      },
    },
  });

  return transformMulta(multa);
}

export async function updateMulta(id: bigint, data: any, adminEmail: string) {
  const existing = await prisma.multas.findUnique({ where: { id } });
  if (!existing) throw new Error('Multa no encontrada');
  if (existing.cancelada_por) throw new Error('No se puede editar una multa cancelada');

  const multa = await prisma.multas.update({
    where: { id },
    data: {
      ...(data.monto !== undefined && { monto: data.monto }),
      ...(data.motivo !== undefined && { motivo: data.motivo }),
      ...(data.descripcion !== undefined && { descripcion: data.descripcion }),
      ...(data.fechaAplicacion !== undefined && {
        fecha_aplicacion: data.fechaAplicacion ? new Date(data.fechaAplicacion) : null,
      }),
      updated_at: new Date(),
    },
    include: { cliente: true },
  });

  await prisma.log_auditoria.create({
    data: {
      accion: 'EDITAR_MULTA',
      entidad: 'multas',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: {
        monto: Number(existing.monto),
        motivo: existing.motivo,
      },
      datos_nuevos: {
        monto: Number(multa.monto),
        motivo: multa.motivo,
      },
    },
  });

  return transformMulta(multa);
}

export async function cancelMulta(id: bigint, adminEmail: string) {
  const existing = await prisma.multas.findUnique({ where: { id } });
  if (!existing) throw new Error('Multa no encontrada');
  if (existing.cancelada_por) throw new Error('La multa ya está cancelada');

  await prisma.multas.update({
    where: { id },
    data: {
      cancelada_por: adminEmail,
      fecha_cancelacion: new Date(),
      updated_at: new Date(),
    },
  });

  await prisma.log_auditoria.create({
    data: {
      accion: 'CANCELAR_MULTA',
      entidad: 'multas',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: { estado: 'activa' },
      datos_nuevos: { estado: 'cancelada', canceladaPor: adminEmail },
    },
  });

  return { success: true, message: 'Multa cancelada correctamente' };
}
