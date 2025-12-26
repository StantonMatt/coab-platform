import prisma from '../lib/prisma.js';
import type { CreateMedidorInput, UpdateMedidorInput } from '../schemas/medidores.schema.js';

/**
 * Transform medidor from database to API response format
 */
function transformMedidor(medidor: any) {
  // Build direccion string from its components
  const direccionStr = medidor.direccion
    ? `${medidor.direccion.direccion_calle} ${medidor.direccion.direccion_numero || ''}`.trim()
    : null;

  return {
    id: medidor.id.toString(),
    direccionId: medidor.direccion_id.toString(),
    numeroSerie: medidor.numero_serie,
    marca: medidor.marca,
    modelo: medidor.modelo,
    fechaInstalacion: medidor.fecha_instalacion?.toISOString().split('T')[0] || null,
    fechaRetiro: medidor.fecha_retiro?.toISOString().split('T')[0] || null,
    estado: medidor.estado,
    lecturaInicial: medidor.lectura_inicial ? Number(medidor.lectura_inicial) : 0,
    mostrarEnRuta: medidor.mostrar_en_ruta,
    fechaCreacion: medidor.fecha_creacion,
    // Included if joined
    direccion: medidor.direccion
      ? {
          id: medidor.direccion.id.toString(),
          direccion: direccionStr,
          poblacion: medidor.direccion.poblacion,
          numeroCliente: medidor.direccion.cliente?.numero_cliente || null,
          clienteNombre: medidor.direccion.cliente
            ? `${medidor.direccion.cliente.primer_nombre} ${medidor.direccion.cliente.primer_apellido}`
            : null,
        }
      : null,
    ultimaLectura: medidor.lecturas?.[0]
      ? {
          id: medidor.lecturas[0].id.toString(),
          lectura: Number(medidor.lecturas[0].valor_lectura),
          fecha: medidor.lecturas[0].fecha_lectura,
        }
      : null,
  };
}

/**
 * Get all medidores with pagination and filters
 */
export async function getAllMedidores(
  page: number = 1,
  limit: number = 50,
  filters?: {
    estado?: string;
    search?: string;
    sortBy?: 'numeroSerie' | 'cliente' | 'estado' | 'fechaInstalacion';
    sortDirection?: 'asc' | 'desc';
  }
) {
  const skip = (page - 1) * limit;
  const sortBy = filters?.sortBy || 'fechaInstalacion';
  const sortDirection = filters?.sortDirection || 'desc';

  const where: any = {};

  if (filters?.estado) {
    // Special filters based on fecha_retiro
    if (filters.estado === 'retirado') {
      // Has a fecha_retiro (has been removed)
      where.fecha_retiro = { not: null };
    } else if (filters.estado === 'en_servicio') {
      // No fecha_retiro (still in service)
      where.fecha_retiro = null;
    } else {
      // Regular estado filter (activo, averiados, etc.)
      where.estado = filters.estado;
    }
  }

  if (filters?.search) {
    where.OR = [
      { numero_serie: { contains: filters.search, mode: 'insensitive' } },
      { direccion: { direccion_calle: { contains: filters.search, mode: 'insensitive' } } },
      { direccion: { cliente: { numero_cliente: { contains: filters.search, mode: 'insensitive' } } } },
      { direccion: { cliente: { primer_nombre: { contains: filters.search, mode: 'insensitive' } } } },
      { direccion: { cliente: { primer_apellido: { contains: filters.search, mode: 'insensitive' } } } },
    ];
  }

  // Build orderBy based on sortBy parameter
  let orderBy: any;
  switch (sortBy) {
    case 'numeroSerie':
      orderBy = { numero_serie: sortDirection };
      break;
    case 'cliente':
      orderBy = { direccion: { cliente: { primer_apellido: sortDirection } } };
      break;
    case 'estado':
      orderBy = { estado: sortDirection };
      break;
    case 'fechaInstalacion':
    default:
      orderBy = { fecha_instalacion: sortDirection };
      break;
  }

  const [medidores, total] = await Promise.all([
    prisma.medidores.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        direccion: {
          include: {
            cliente: {
              select: { numero_cliente: true, primer_nombre: true, primer_apellido: true },
            },
          },
        },
        lecturas: {
          orderBy: { fecha_lectura: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.medidores.count({ where }),
  ]);

  return {
    medidores: medidores.map(transformMedidor),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get a single medidor by ID with full details
 */
export async function getMedidorById(id: bigint) {
  const medidor = await prisma.medidores.findUnique({
    where: { id },
    include: {
      direccion: {
        include: {
          cliente: {
            select: {
              id: true,
              primer_nombre: true,
              segundo_nombre: true,
              primer_apellido: true,
              segundo_apellido: true,
              numero_cliente: true,
            },
          },
          ruta: true,
        },
      },
      lecturas: {
        orderBy: { fecha_lectura: 'desc' },
        take: 12, // Last 12 readings
      },
    },
  });

  if (!medidor) {
    throw new Error('Medidor no encontrado');
  }

  return {
    ...transformMedidor(medidor),
    cliente: medidor.direccion.cliente
      ? {
          id: medidor.direccion.cliente.id.toString(),
          numeroCliente: medidor.direccion.cliente.numero_cliente,
          nombre: `${medidor.direccion.cliente.primer_nombre} ${medidor.direccion.cliente.primer_apellido}`,
          nombreCompleto: [
            medidor.direccion.cliente.primer_nombre,
            medidor.direccion.cliente.segundo_nombre,
            medidor.direccion.cliente.primer_apellido,
            medidor.direccion.cliente.segundo_apellido,
          ]
            .filter(Boolean)
            .join(' '),
        }
      : null,
    ruta: medidor.direccion.ruta
      ? {
          id: medidor.direccion.ruta.id.toString(),
          nombre: medidor.direccion.ruta.nombre,
        }
      : null,
    lecturas: medidor.lecturas.map((l) => ({
      id: l.id.toString(),
      valorLectura: Number(l.valor_lectura),
      fecha: l.fecha_lectura,
      periodoAno: l.periodo_ano,
      periodoMes: l.periodo_mes,
      confirmada: l.confirmada,
      advertencia: l.advertencia,
    })),
  };
}

/**
 * Get medidores by cliente ID
 */
export async function getMedidoresByCliente(clienteId: bigint) {
  const medidores = await prisma.medidores.findMany({
    where: {
      direccion: { cliente_id: clienteId },
    },
    include: {
      direccion: true,
      lecturas: {
        orderBy: { fecha_lectura: 'desc' },
        take: 1,
      },
    },
    orderBy: { fecha_creacion: 'desc' },
  });

  return medidores.map(transformMedidor);
}

/**
 * Create a new medidor
 */
export async function createMedidor(data: CreateMedidorInput, adminEmail: string) {
  // Verify direccion exists
  const direccion = await prisma.direcciones.findUnique({
    where: { id: BigInt(data.direccionId) },
  });

  if (!direccion) {
    throw new Error('Dirección no encontrada');
  }

  const medidor = await prisma.medidores.create({
    data: {
      direccion_id: BigInt(data.direccionId),
      numero_serie: data.numeroSerie || null,
      marca: data.marca || null,
      modelo: data.modelo || null,
      fecha_instalacion: data.fechaInstalacion ? new Date(data.fechaInstalacion) : null,
      lectura_inicial: data.lecturaInicial || 0,
      mostrar_en_ruta: data.mostrarEnRuta ?? true,
    },
    include: {
      direccion: true,
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'CREAR_MEDIDOR',
      entidad: 'medidores',
      entidad_id: medidor.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: {
        direccionId: data.direccionId,
        numeroSerie: data.numeroSerie,
        marca: data.marca,
        modelo: data.modelo,
      },
    },
  });

  return transformMedidor(medidor);
}

/**
 * Update an existing medidor
 */
export async function updateMedidor(id: bigint, data: UpdateMedidorInput, adminEmail: string) {
  const existing = await prisma.medidores.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Medidor no encontrado');
  }

  const datosAnteriores = {
    numeroSerie: existing.numero_serie,
    marca: existing.marca,
    modelo: existing.modelo,
    estado: existing.estado,
    mostrarEnRuta: existing.mostrar_en_ruta,
  };

  const medidor = await prisma.medidores.update({
    where: { id },
    data: {
      ...(data.numeroSerie !== undefined && { numero_serie: data.numeroSerie }),
      ...(data.marca !== undefined && { marca: data.marca }),
      ...(data.modelo !== undefined && { modelo: data.modelo }),
      ...(data.fechaInstalacion !== undefined && {
        fecha_instalacion: data.fechaInstalacion ? new Date(data.fechaInstalacion) : null,
      }),
      ...(data.fechaRetiro !== undefined && {
        fecha_retiro: data.fechaRetiro ? new Date(data.fechaRetiro) : null,
      }),
      ...(data.estado !== undefined && { estado: data.estado }),
      ...(data.mostrarEnRuta !== undefined && { mostrar_en_ruta: data.mostrarEnRuta }),
      ...(data.lecturaInicial !== undefined && { lectura_inicial: data.lecturaInicial }),
    },
    include: {
      direccion: true,
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'EDITAR_MEDIDOR',
      entidad: 'medidores',
      entidad_id: medidor.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: datosAnteriores,
      datos_nuevos: {
        numeroSerie: medidor.numero_serie,
        marca: medidor.marca,
        modelo: medidor.modelo,
        estado: medidor.estado,
        mostrarEnRuta: medidor.mostrar_en_ruta,
      },
    },
  });

  return transformMedidor(medidor);
}

/**
 * Delete a medidor (only if no lecturas)
 */
export async function deleteMedidor(id: bigint, adminEmail: string) {
  const existing = await prisma.medidores.findUnique({
    where: { id },
    include: {
      _count: { select: { lecturas: true } },
    },
  });

  if (!existing) {
    throw new Error('Medidor no encontrado');
  }

  if (existing._count.lecturas > 0) {
    throw new Error(
      `No se puede eliminar: hay ${existing._count.lecturas} lecturas registradas`
    );
  }

  await prisma.medidores.delete({ where: { id } });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'ELIMINAR_MEDIDOR',
      entidad: 'medidores',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: {
        numeroSerie: existing.numero_serie,
        marca: existing.marca,
        modelo: existing.modelo,
      },
    },
  });

  return { success: true, message: 'Medidor eliminado correctamente' };
}

/**
 * Toggle mostrar_en_ruta for a medidor
 */
export async function toggleMostrarEnRuta(id: bigint, adminEmail: string) {
  const existing = await prisma.medidores.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Medidor no encontrado');
  }

  const newValue = !existing.mostrar_en_ruta;

  const medidor = await prisma.medidores.update({
    where: { id },
    data: { mostrar_en_ruta: newValue },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'TOGGLE_MEDIDOR_RUTA',
      entidad: 'medidores',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: { mostrarEnRuta: existing.mostrar_en_ruta },
      datos_nuevos: { mostrarEnRuta: newValue },
    },
  });

  return {
    id: medidor.id.toString(),
    mostrarEnRuta: medidor.mostrar_en_ruta,
    message: newValue ? 'Medidor agregado a la ruta' : 'Medidor removido de la ruta',
  };
}
