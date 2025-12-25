import prisma from '../lib/prisma.js';
import type { UpdateLecturaInput, CreateCorreccionInput } from '../schemas/lecturas.schema.js';

/**
 * Transform lectura from database to API response format
 */
function transformLectura(lectura: any) {
  // Get corrected value if exists
  const correccion = lectura.lectura_correcciones;
  const valorFinal = correccion ? Number(correccion.valor_corregido) : Number(lectura.valor_lectura);

  return {
    id: lectura.id.toString(),
    medidorId: lectura.medidor_id.toString(),
    valorLectura: Number(lectura.valor_lectura),
    valorCorregido: correccion ? Number(correccion.valor_corregido) : null,
    fechaLectura: lectura.fecha_lectura,
    periodoAno: lectura.periodo_ano,
    periodoMes: lectura.periodo_mes,
    tipoLectura: lectura.tipo_lectura,
    confirmada: lectura.confirmada,
    observaciones: lectura.observaciones,
    advertencia: lectura.advertencia,
    propiedadVacante: lectura.propiedad_vacante,
    notasNoAcceso: lectura.notas_no_acceso,
    tieneCorreccion: lectura.tiene_correccion || !!correccion,
    // Joined data
    medidor: lectura.medidor
      ? {
          id: lectura.medidor.id.toString(),
          numeroSerie: lectura.medidor.numero_serie,
          direccion: lectura.medidor.direccion
            ? {
                id: lectura.medidor.direccion.id.toString(),
                direccion: `${lectura.medidor.direccion.direccion_calle} ${lectura.medidor.direccion.direccion_numero || ''}`.trim(),
                poblacion: lectura.medidor.direccion.poblacion,
              }
            : null,
          cliente: lectura.medidor.direccion?.cliente
            ? {
                id: lectura.medidor.direccion.cliente.id.toString(),
                numeroCliente: lectura.medidor.direccion.cliente.numero_cliente,
                nombre: `${lectura.medidor.direccion.cliente.primer_nombre} ${lectura.medidor.direccion.cliente.primer_apellido}`,
                recibeFactura: lectura.medidor.direccion.cliente.recibe_factura || false,
              }
            : null,
        }
      : null,
    correccion: correccion
      ? {
          id: correccion.id.toString(),
          valorOriginal: Number(lectura.valor_lectura),
          valorCorregido: Number(correccion.valor_corregido),
          motivoCorreccion: correccion.motivo_correccion,
          corregidoPor: correccion.corregido_por,
          fechaCorreccion: correccion.fecha_correccion,
        }
      : null,
  };
}

/**
 * Get all lecturas with pagination and filters
 */
export async function getAllLecturas(options: {
  page: number;
  limit: number;
  medidorId?: string;
  clienteId?: string;
  periodoAno?: number;
  periodoMes?: number;
  conCorreccion?: string;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}) {
  const skip = (options.page - 1) * options.limit;

  const where: any = {};

  if (options.medidorId) {
    where.medidor_id = BigInt(options.medidorId);
  }

  if (options.clienteId) {
    where.medidor = {
      direccion: { cliente_id: BigInt(options.clienteId) },
    };
  }

  if (options.periodoAno) {
    where.periodo_ano = options.periodoAno;
  }

  if (options.periodoMes) {
    where.periodo_mes = options.periodoMes;
  }

  if (options.conCorreccion === 'true') {
    // Filter by actual existence of correction record, not just the flag
    where.lectura_correcciones = { isNot: null };
  } else if (options.conCorreccion === 'false') {
    where.lectura_correcciones = null;
  }

  if (options.search) {
    where.OR = [
      {
        medidor: {
          numero_serie: { contains: options.search, mode: 'insensitive' },
        },
      },
      {
        medidor: {
          direccion: {
            cliente: {
              OR: [
                { primer_nombre: { contains: options.search, mode: 'insensitive' } },
                { primer_apellido: { contains: options.search, mode: 'insensitive' } },
                { numero_cliente: { contains: options.search, mode: 'insensitive' } },
              ],
            },
          },
        },
      },
    ];
  }

  // Build orderBy based on sort parameters
  let orderBy: any[] = [{ periodo_ano: 'desc' }, { periodo_mes: 'desc' }, { fecha_lectura: 'desc' }];
  
  if (options.sortBy) {
    const direction = options.sortDirection === 'asc' ? 'asc' : 'desc';
    switch (options.sortBy) {
      case 'periodo':
        orderBy = [{ periodo_ano: direction }, { periodo_mes: direction }];
        break;
      case 'numeroCliente':
        orderBy = [{ medidor: { direccion: { cliente: { numero_cliente: direction } } } }];
        break;
      case 'nombreCliente':
        orderBy = [{ medidor: { direccion: { cliente: { primer_nombre: direction } } } }];
        break;
      case 'lectura':
        orderBy = [{ valor_lectura: direction }];
        break;
      case 'estado':
        // Sort by confirmada status (pending first or last based on direction)
        orderBy = [{ confirmada: direction }];
        break;
    }
  }

  const [lecturas, total] = await Promise.all([
    prisma.lecturas.findMany({
      where,
      orderBy,
      skip,
      take: options.limit,
      include: {
        medidor: {
          include: {
            direccion: {
              include: {
                cliente: {
                  select: {
                    id: true,
                    numero_cliente: true,
                    primer_nombre: true,
                    primer_apellido: true,
                    recibe_factura: true,
                  },
                },
              },
            },
          },
        },
        lectura_correcciones: true,
      },
    }),
    prisma.lecturas.count({ where }),
  ]);

  return {
    lecturas: lecturas.map(transformLectura),
    pagination: {
      total,
      page: options.page,
      limit: options.limit,
      totalPages: Math.ceil(total / options.limit),
    },
  };
}

/**
 * Get a single lectura by ID
 */
export async function getLecturaById(id: bigint) {
  const lectura = await prisma.lecturas.findUnique({
    where: { id },
    include: {
      medidor: {
        include: {
          direccion: {
            include: {
              cliente: true,
            },
          },
        },
      },
      lectura_correcciones: true,
    },
  });

  if (!lectura) {
    throw new Error('Lectura no encontrada');
  }

  return transformLectura(lectura);
}

/**
 * Get context for a lectura (previous reading and average consumption)
 */
export async function getLecturaContext(id: bigint) {
  const lectura = await prisma.lecturas.findUnique({
    where: { id },
    include: {
      medidor: true,
    },
  });

  if (!lectura) {
    throw new Error('Lectura no encontrada');
  }

  // Calculate previous month
  let prevAno = lectura.periodo_ano;
  let prevMes = lectura.periodo_mes - 1;
  if (prevMes < 1) {
    prevMes = 12;
    prevAno -= 1;
  }

  // Get previous month's lectura for the same medidor
  const lecturaAnterior = await prisma.lecturas.findFirst({
    where: {
      medidor_id: lectura.medidor_id,
      periodo_ano: prevAno,
      periodo_mes: prevMes,
    },
    include: {
      lectura_correcciones: true,
    },
  });

  // Get last 5 months of lecturas for average calculation (excluding current)
  const last5Lecturas = await prisma.lecturas.findMany({
    where: {
      medidor_id: lectura.medidor_id,
      NOT: { id: lectura.id },
      // Only lecturas before or equal to the current period
      OR: [
        { periodo_ano: { lt: lectura.periodo_ano } },
        {
          periodo_ano: lectura.periodo_ano,
          periodo_mes: { lt: lectura.periodo_mes },
        },
      ],
    },
    orderBy: [{ periodo_ano: 'desc' }, { periodo_mes: 'desc' }],
    take: 5,
    include: {
      lectura_correcciones: true,
    },
  });

  // Calculate consumption for each period
  const consumos: number[] = [];
  
  for (let i = 0; i < last5Lecturas.length - 1; i++) {
    const current = last5Lecturas[i];
    const previous = last5Lecturas[i + 1];
    
    // Use corrected value if exists
    const currentValue = current.lectura_correcciones 
      ? Number(current.lectura_correcciones.valor_corregido)
      : Number(current.valor_lectura);
    const previousValue = previous.lectura_correcciones
      ? Number(previous.lectura_correcciones.valor_corregido)
      : Number(previous.valor_lectura);
    
    const consumo = currentValue - previousValue;
    if (consumo >= 0) {
      consumos.push(consumo);
    }
  }

  // Calculate average
  const promedioConsumo = consumos.length > 0
    ? consumos.reduce((a, b) => a + b, 0) / consumos.length
    : null;

  // Get the value of the previous lectura (corrected if exists)
  let valorLecturaAnterior: number | null = null;
  if (lecturaAnterior) {
    valorLecturaAnterior = lecturaAnterior.lectura_correcciones
      ? Number(lecturaAnterior.lectura_correcciones.valor_corregido)
      : Number(lecturaAnterior.valor_lectura);
  }

  // Calculate current consumption
  const valorActual = lectura.lectura_correcciones
    ? Number((lectura as any).lectura_correcciones.valor_corregido)
    : Number(lectura.valor_lectura);
  const consumoActual = valorLecturaAnterior !== null
    ? valorActual - valorLecturaAnterior
    : null;

  return {
    lecturaAnterior: lecturaAnterior ? {
      id: lecturaAnterior.id.toString(),
      valorLectura: Number(lecturaAnterior.valor_lectura),
      valorCorregido: lecturaAnterior.lectura_correcciones
        ? Number(lecturaAnterior.lectura_correcciones.valor_corregido)
        : null,
      periodoAno: lecturaAnterior.periodo_ano,
      periodoMes: lecturaAnterior.periodo_mes,
    } : null,
    consumoActual,
    promedioConsumo: promedioConsumo !== null ? Math.round(promedioConsumo * 10) / 10 : null,
    mesesEnPromedio: consumos.length,
  };
}

/**
 * Update lectura value (before boleta generation)
 */
export async function updateLectura(id: bigint, data: UpdateLecturaInput, adminEmail: string) {
  const lectura = await prisma.lecturas.findUnique({
    where: { id },
  });

  if (!lectura) {
    throw new Error('Lectura no encontrada');
  }

  const datosAnteriores = {
    valorLectura: Number(lectura.valor_lectura),
    observaciones: lectura.observaciones,
  };

  const updated = await prisma.lecturas.update({
    where: { id },
    data: {
      valor_lectura: data.valorLectura,
      observaciones: data.observaciones !== undefined ? data.observaciones : lectura.observaciones,
      confirmada: true,
    },
    include: {
      medidor: {
        include: {
          direccion: true,
        },
      },
      lectura_correcciones: true,
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'EDITAR_LECTURA',
      entidad: 'lecturas',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: datosAnteriores,
      datos_nuevos: {
        valorLectura: Number(updated.valor_lectura),
        observaciones: updated.observaciones,
      },
    },
  });

  return transformLectura(updated);
}

/**
 * Create correction for lectura
 */
export async function createCorreccion(lecturaId: bigint, data: CreateCorreccionInput, adminEmail: string) {
  const lectura = await prisma.lecturas.findUnique({
    where: { id: lecturaId },
  });

  if (!lectura) {
    throw new Error('Lectura no encontrada');
  }

  // Check if correction already exists
  const existingCorreccion = await prisma.lectura_correcciones.findUnique({
    where: { lectura_original_id: lecturaId },
  });

  if (existingCorreccion) {
    // Update existing correction
    const correccion = await prisma.lectura_correcciones.update({
      where: { lectura_original_id: lecturaId },
      data: {
        valor_corregido: data.valorCorregido,
        motivo_correccion: data.motivoCorreccion,
        corregido_por: adminEmail,
        fecha_correccion: new Date(),
      },
    });

    await prisma.lecturas.update({
      where: { id: lecturaId },
      data: { tiene_correccion: true },
    });

    return {
      success: true,
      message: 'Corrección actualizada correctamente',
      correccion: {
        id: correccion.id.toString(),
        valorOriginal: Number(lectura.valor_lectura),
        valorCorregido: Number(correccion.valor_corregido),
        motivo: correccion.motivo_correccion,
        corregidoPor: correccion.corregido_por,
        fecha: correccion.fecha_correccion,
      },
    };
  }

  // Create new correction
  const correccion = await prisma.lectura_correcciones.create({
    data: {
      lectura_original_id: lecturaId,
      valor_corregido: data.valorCorregido,
      motivo_correccion: data.motivoCorreccion,
      corregido_por: adminEmail,
    },
  });

  // Update lectura flag
  await prisma.lecturas.update({
    where: { id: lecturaId },
    data: { tiene_correccion: true },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'CREAR_CORRECCION_LECTURA',
      entidad: 'lectura_correcciones',
      entidad_id: correccion.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: {
        lecturaId: lecturaId.toString(),
        valorOriginal: Number(lectura.valor_lectura),
        valorCorregido: data.valorCorregido,
        motivo: data.motivoCorreccion,
      },
    },
  });

  return {
    success: true,
    message: 'Corrección registrada correctamente',
    correccion: {
      id: correccion.id.toString(),
      valorOriginal: Number(lectura.valor_lectura),
      valorCorregido: Number(correccion.valor_corregido),
      motivo: correccion.motivo_correccion,
      corregidoPor: correccion.corregido_por,
      fecha: correccion.fecha_correccion,
    },
  };
}

/**
 * Get lecturas by cliente
 */
export async function getLecturasByCliente(clienteId: bigint, limit: number = 24) {
  const lecturas = await prisma.lecturas.findMany({
    where: {
      medidor: {
        direccion: { cliente_id: clienteId },
      },
    },
    orderBy: [{ periodo_ano: 'desc' }, { periodo_mes: 'desc' }],
    take: limit,
    include: {
      medidor: {
        include: {
          direccion: true,
        },
      },
      lectura_correcciones: true,
    },
  });

  return lecturas.map(transformLectura);
}
