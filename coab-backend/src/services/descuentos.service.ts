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

export async function getAllDescuentos(
  page: number = 1,
  limit: number = 50,
  sortBy: 'nombre' | 'tipo' | 'valor' | 'fechaCreacion' = 'fechaCreacion',
  sortDirection: 'asc' | 'desc' = 'desc'
) {
  const skip = (page - 1) * limit;

  let orderBy: any;
  switch (sortBy) {
    case 'nombre':
      orderBy = { nombre: sortDirection };
      break;
    case 'tipo':
      orderBy = { tipo_descuento: sortDirection };
      break;
    case 'valor':
      orderBy = { valor: sortDirection };
      break;
    case 'fechaCreacion':
    default:
      orderBy = { fecha_creacion: sortDirection };
      break;
  }

  const [descuentos, total] = await Promise.all([
    prisma.descuentos.findMany({ orderBy, skip, take: limit }),
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

// ============================================================================
// DESCUENTOS APLICADOS - CRUD Functions
// ============================================================================

interface DescuentoAplicadoFilters {
  clienteId?: string;
  rutaId?: string;
  descuentoId?: string;
  soloPlantilla?: boolean;
  soloAdhoc?: boolean;
  soloPendientes?: boolean;
  fechaDesde?: string;
  fechaHasta?: string;
  search?: string;
}

function transformDescuentoAplicado(da: any) {
  // Format periodo from periodo_desde date
  let boletaPeriodo: string | null = null;
  if (da.boleta?.periodo_desde) {
    const periodoDate = new Date(da.boleta.periodo_desde);
    const mes = periodoDate.getMonth() + 1;
    const ano = periodoDate.getFullYear();
    boletaPeriodo = `${mes}/${ano}`;
  }

  return {
    id: da.id.toString(),
    clienteId: da.cliente_id?.toString() || null,
    clienteNombre: da.cliente
      ? `${da.cliente.primer_nombre || ''} ${da.cliente.primer_apellido || ''}`.trim()
      : null,
    clienteNumero: da.cliente?.numero_cliente || null,
    boletaId: da.boleta_id?.toString() || null,
    boletaPeriodo,
    descuentoId: da.descuento_id?.toString() || null,
    descuentoNombre: da.descuento?.nombre || null,
    tipoDescuento: da.descuento?.tipo_descuento || da.tipo_adhoc || 'monto_fijo',
    valorDescuento: da.descuento ? Number(da.descuento.valor) : null,
    montoAplicado: Number(da.monto_aplicado),
    motivoAdhoc: da.motivo_adhoc || null,
    fechaAplicacion: da.fecha_aplicacion?.toISOString() || null,
    estado: da.boleta_id ? 'aplicado' : 'pendiente',
    esAdhoc: !da.descuento_id,
  };
}

export async function getAllDescuentosAplicados(
  page: number = 1,
  limit: number = 50,
  filters: DescuentoAplicadoFilters = {},
  sortBy: 'cliente' | 'monto' | 'fecha' | 'estado' = 'fecha',
  sortDirection: 'asc' | 'desc' = 'desc'
) {
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  if (filters.clienteId) {
    where.cliente_id = BigInt(filters.clienteId);
  }

  if (filters.descuentoId) {
    where.descuento_id = BigInt(filters.descuentoId);
  }

  if (filters.soloPlantilla) {
    where.descuento_id = { not: null };
  }

  if (filters.soloAdhoc) {
    where.descuento_id = null;
  }

  if (filters.soloPendientes) {
    where.boleta_id = null;
  }

  if (filters.fechaDesde) {
    where.fecha_aplicacion = {
      ...where.fecha_aplicacion,
      gte: new Date(filters.fechaDesde),
    };
  }

  if (filters.fechaHasta) {
    where.fecha_aplicacion = {
      ...where.fecha_aplicacion,
      lte: new Date(filters.fechaHasta + 'T23:59:59'),
    };
  }

  // Filter by ruta (through cliente -> direcciones)
  if (filters.rutaId) {
    where.cliente = {
      direcciones: {
        some: {
          ruta_id: BigInt(filters.rutaId),
        },
      },
    };
  }

  // Search by cliente name or numero
  if (filters.search) {
    where.cliente = {
      ...where.cliente,
      OR: [
        { primer_nombre: { contains: filters.search, mode: 'insensitive' } },
        { primer_apellido: { contains: filters.search, mode: 'insensitive' } },
        { numero_cliente: { contains: filters.search, mode: 'insensitive' } },
      ],
    };
  }

  // Build orderBy
  let orderBy: any;
  switch (sortBy) {
    case 'cliente':
      orderBy = { cliente: { primer_apellido: sortDirection } };
      break;
    case 'monto':
      orderBy = { monto_aplicado: sortDirection };
      break;
    case 'estado':
      orderBy = { boleta_id: sortDirection };
      break;
    case 'fecha':
    default:
      orderBy = { fecha_aplicacion: sortDirection };
      break;
  }

  const [aplicados, total] = await Promise.all([
    prisma.descuentos_aplicados.findMany({
      where,
      include: {
        cliente: {
          select: {
            id: true,
            primer_nombre: true,
            primer_apellido: true,
            numero_cliente: true,
          },
        },
        descuento: {
          select: {
            id: true,
            nombre: true,
            tipo_descuento: true,
            valor: true,
          },
        },
        boleta: {
          select: {
            id: true,
            periodo_desde: true,
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.descuentos_aplicados.count({ where }),
  ]);

  return {
    descuentosAplicados: aplicados.map((da) => transformDescuentoAplicado(da)),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getDescuentoAplicadoById(id: bigint) {
  const da = await prisma.descuentos_aplicados.findUnique({
    where: { id },
    include: {
      cliente: {
        select: {
          id: true,
          primer_nombre: true,
          primer_apellido: true,
          numero_cliente: true,
          rut: true,
        },
      },
      descuento: true,
      boleta: {
        select: {
          id: true,
          periodo_desde: true,
          monto_total: true,
        },
      },
    },
  });

  if (!da) throw new Error('Descuento aplicado no encontrado');

  return {
    ...transformDescuentoAplicado(da as any),
    clienteRut: (da as any).cliente?.rut || null,
    descuentoDetalle: (da as any).descuento ? transformDescuento((da as any).descuento) : null,
    boletaMontoTotal: (da as any).boleta ? Number((da as any).boleta.monto_total) : null,
  };
}

interface CreateDescuentoIndividualInput {
  clienteId: string;
  tipo: 'porcentaje' | 'monto_fijo';
  valor: number;
  motivo: string;
}

export async function createDescuentoIndividual(
  data: CreateDescuentoIndividualInput,
  adminEmail: string
) {
  const clienteId = BigInt(data.clienteId);

  // Verify cliente exists
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
    select: { id: true, primer_nombre: true, primer_apellido: true, numero_cliente: true },
  });

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  // For ad-hoc discounts, we store the monto directly
  // If it's a percentage, we'll need to calculate at billing time
  // For now, we store the value and type in a JSON field or calculate now
  let montoAplicado = data.valor;
  
  // If percentage, we can't calculate final amount without knowing the boleta
  // So we store as-is and billing process will handle it
  // For simplicity, if percentage, we still need to track it somehow
  // We'll add a tipo_adhoc field conceptually via the motivo

  const descuentoAplicado = await prisma.descuentos_aplicados.create({
    data: {
      cliente_id: clienteId,
      descuento_id: null, // Ad-hoc, no template
      boleta_id: null, // Will be applied to next boleta
      monto_aplicado: montoAplicado,
      fecha_aplicacion: new Date(),
    },
  });

  // Log the action with full details including tipo and motivo
  await prisma.log_auditoria.create({
    data: {
      accion: 'CREAR_DESCUENTO_ADHOC',
      entidad: 'descuentos_aplicados',
      entidad_id: descuentoAplicado.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: {
        clienteId: data.clienteId,
        tipo: data.tipo,
        valor: data.valor,
        motivo: data.motivo,
        montoAplicado,
      },
    },
  });

  return {
    id: descuentoAplicado.id.toString(),
    clienteId: cliente.id.toString(),
    clienteNombre: `${cliente.primer_nombre || ''} ${cliente.primer_apellido || ''}`.trim(),
    clienteNumero: cliente.numero_cliente,
    montoAplicado,
    tipo: data.tipo,
    motivo: data.motivo,
    estado: 'pendiente',
  };
}

interface CreateDescuentoMasivoInput {
  // Template info (can be new or existing)
  descuentoId?: string; // If using existing template
  template?: {
    nombre: string;
    tipo: 'porcentaje' | 'monto_fijo';
    valor: number;
    descripcion?: string;
  };
  // Recipient selection
  recipientFilter: 'todos' | 'ruta' | 'manual';
  rutaId?: string;
  clienteIds?: string[];
}

export async function createDescuentoMasivo(
  data: CreateDescuentoMasivoInput,
  adminEmail: string
) {
  let descuentoId: bigint;
  let descuentoNombre: string;
  let descuentoValor: number;
  let descuentoTipo: string;

  // Get or create template
  if (data.descuentoId) {
    // Use existing template
    const existing = await prisma.descuentos.findUnique({
      where: { id: BigInt(data.descuentoId) },
    });
    if (!existing) {
      throw new Error('Plantilla de descuento no encontrada');
    }
    descuentoId = existing.id;
    descuentoNombre = existing.nombre;
    descuentoValor = Number(existing.valor);
    descuentoTipo = existing.tipo_descuento;
  } else if (data.template) {
    // Create new template
    const newDescuento = await prisma.descuentos.create({
      data: {
        nombre: data.template.nombre,
        descripcion: data.template.descripcion || null,
        tipo_descuento: data.template.tipo,
        valor: data.template.valor,
        fecha_inicio: new Date(),
        activo: true,
        creado_por: adminEmail,
      },
    });
    descuentoId = newDescuento.id;
    descuentoNombre = newDescuento.nombre;
    descuentoValor = Number(newDescuento.valor);
    descuentoTipo = newDescuento.tipo_descuento;

    await prisma.log_auditoria.create({
      data: {
        accion: 'CREAR_DESCUENTO',
        entidad: 'descuentos',
        entidad_id: newDescuento.id,
        usuario_tipo: 'admin',
        usuario_email: adminEmail,
        datos_nuevos: data.template,
      },
    });
  } else {
    throw new Error('Debe proporcionar un descuentoId existente o datos de template');
  }

  // Get target clients based on filter
  let clienteIds: bigint[] = [];

  switch (data.recipientFilter) {
    case 'todos':
      const allClients = await prisma.clientes.findMany({
        where: { es_cliente_actual: true },
        select: { id: true },
      });
      clienteIds = allClients.map((c) => c.id);
      break;

    case 'ruta':
      if (!data.rutaId) {
        throw new Error('Debe especificar una ruta');
      }
      const clientesEnRuta = await prisma.clientes.findMany({
        where: {
          es_cliente_actual: true,
          direcciones: {
            some: {
              ruta_id: BigInt(data.rutaId),
            },
          },
        },
        select: { id: true },
      });
      clienteIds = clientesEnRuta.map((c) => c.id);
      break;

    case 'manual':
      if (!data.clienteIds || data.clienteIds.length === 0) {
        throw new Error('Debe seleccionar al menos un cliente');
      }
      clienteIds = data.clienteIds.map((id) => BigInt(id));
      break;
  }

  if (clienteIds.length === 0) {
    throw new Error('No se encontraron clientes para aplicar el descuento');
  }

  // Check for existing pending discounts with same template for these clients
  const existingPending = await prisma.descuentos_aplicados.findMany({
    where: {
      descuento_id: descuentoId,
      boleta_id: null,
      cliente_id: { in: clienteIds },
    },
    select: { cliente_id: true },
  });

  const existingClienteIds = new Set(existingPending.map((e) => e.cliente_id?.toString()));
  const newClienteIds = clienteIds.filter((id) => !existingClienteIds.has(id.toString()));

  if (newClienteIds.length === 0) {
    throw new Error('Todos los clientes seleccionados ya tienen este descuento pendiente');
  }

  // Create descuentos_aplicados for each client
  const createdRecords = await prisma.descuentos_aplicados.createMany({
    data: newClienteIds.map((clienteId) => ({
      cliente_id: clienteId,
      descuento_id: descuentoId,
      boleta_id: null,
      monto_aplicado: descuentoValor, // Store the value; actual calculation happens at billing
      fecha_aplicacion: new Date(),
    })),
  });

  await prisma.log_auditoria.create({
    data: {
      accion: 'CREAR_DESCUENTO_MASIVO',
      entidad: 'descuentos_aplicados',
      entidad_id: descuentoId,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: {
        descuentoId: descuentoId.toString(),
        descuentoNombre,
        recipientFilter: data.recipientFilter,
        rutaId: data.rutaId,
        totalClientes: newClienteIds.length,
        clientesOmitidos: existingPending.length,
      },
    },
  });

  return {
    success: true,
    descuentoId: descuentoId.toString(),
    descuentoNombre,
    descuentoTipo,
    descuentoValor,
    clientesAplicados: newClienteIds.length,
    clientesOmitidos: existingPending.length,
    mensaje: `Descuento "${descuentoNombre}" aplicado a ${newClienteIds.length} cliente(s)`,
  };
}

export async function deleteDescuentoAplicado(id: bigint, adminEmail: string) {
  const existing = await prisma.descuentos_aplicados.findUnique({
    where: { id },
    include: {
      cliente: { select: { primer_nombre: true, primer_apellido: true, numero_cliente: true } },
      descuento: { select: { nombre: true } },
    },
  });

  if (!existing) {
    throw new Error('Descuento aplicado no encontrado');
  }

  if (existing.boleta_id) {
    throw new Error('No se puede eliminar un descuento que ya fue aplicado a una boleta');
  }

  await prisma.descuentos_aplicados.delete({ where: { id } });

  await prisma.log_auditoria.create({
    data: {
      accion: 'ELIMINAR_DESCUENTO_APLICADO',
      entidad: 'descuentos_aplicados',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: {
        clienteNombre: `${existing.cliente?.primer_nombre || ''} ${existing.cliente?.primer_apellido || ''}`.trim(),
        clienteNumero: existing.cliente?.numero_cliente,
        descuentoNombre: existing.descuento?.nombre || 'Ad-hoc',
        montoAplicado: Number(existing.monto_aplicado),
      },
    },
  });

  return { success: true, message: 'Descuento pendiente eliminado' };
}

// Helper: Get all rutas for dropdown
export async function getAllRutas() {
  const rutas = await prisma.rutas.findMany({
    orderBy: { nombre: 'asc' },
    select: {
      id: true,
      nombre: true,
      _count: {
        select: { direcciones: true },
      },
    },
  });

  return rutas.map((r) => ({
    id: r.id.toString(),
    nombre: r.nombre,
    cantidadDirecciones: r._count.direcciones,
  }));
}

// Helper: Get client count for preview
export async function getClientCountByFilter(
  filter: 'todos' | 'ruta' | 'manual',
  rutaId?: string,
  clienteIds?: string[]
) {
  switch (filter) {
    case 'todos':
      return await prisma.clientes.count({ where: { es_cliente_actual: true } });
    case 'ruta':
      if (!rutaId) return 0;
      return await prisma.clientes.count({
        where: {
          es_cliente_actual: true,
          direcciones: { some: { ruta_id: BigInt(rutaId) } },
        },
      });
    case 'manual':
      return clienteIds?.length || 0;
    default:
      return 0;
  }
}
