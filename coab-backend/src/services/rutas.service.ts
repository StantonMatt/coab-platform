import prisma from '../lib/prisma.js';
import type { CreateRutaInput, UpdateRutaInput } from '../schemas/rutas.schema.js';

/**
 * Get all rutas with optional pagination
 */
export async function getAllRutas(
  page: number = 1,
  limit: number = 50,
  sortBy: 'nombre' | 'cantidadDirecciones' | 'fechaCreacion' = 'nombre',
  sortDirection: 'asc' | 'desc' = 'asc'
) {
  const skip = (page - 1) * limit;

  let orderBy: any;
  switch (sortBy) {
    case 'cantidadDirecciones':
      orderBy = { direcciones: { _count: sortDirection } };
      break;
    case 'fechaCreacion':
      orderBy = { fecha_creacion: sortDirection };
      break;
    case 'nombre':
    default:
      orderBy = { nombre: sortDirection };
      break;
  }

  const [rutas, total] = await Promise.all([
    prisma.rutas.findMany({
      orderBy,
      skip,
      take: limit,
      include: {
        _count: {
          select: { direcciones: true },
        },
      },
    }),
    prisma.rutas.count(),
  ]);

  return {
    rutas: rutas.map((ruta) => ({
      id: ruta.id.toString(),
      nombre: ruta.nombre,
      descripcion: ruta.descripcion,
      cantidadDirecciones: ruta._count.direcciones,
      fechaCreacion: ruta.fecha_creacion,
      fechaActualizacion: ruta.fecha_actualizacion,
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
 * Get a single ruta by ID
 */
export async function getRutaById(id: bigint) {
  const ruta = await prisma.rutas.findUnique({
    where: { id },
    include: {
      _count: {
        select: { direcciones: true },
      },
    },
  });

  if (!ruta) {
    throw new Error('Ruta no encontrada');
  }

  return {
    id: ruta.id.toString(),
    nombre: ruta.nombre,
    descripcion: ruta.descripcion,
    cantidadDirecciones: ruta._count.direcciones,
    fechaCreacion: ruta.fecha_creacion,
    fechaActualizacion: ruta.fecha_actualizacion,
  };
}

/**
 * Create a new ruta
 */
export async function createRuta(data: CreateRutaInput, adminEmail: string) {
  // Check for duplicate name
  const existing = await prisma.rutas.findFirst({
    where: { nombre: data.nombre },
  });

  if (existing) {
    throw new Error('Ya existe una ruta con ese nombre');
  }

  const ruta = await prisma.rutas.create({
    data: {
      nombre: data.nombre,
      descripcion: data.descripcion || null,
      fecha_actualizacion: new Date(),
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'CREAR_RUTA',
      entidad: 'rutas',
      entidad_id: ruta.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: {
        nombre: data.nombre,
        descripcion: data.descripcion,
      },
    },
  });

  return {
    id: ruta.id.toString(),
    nombre: ruta.nombre,
    descripcion: ruta.descripcion,
    fechaCreacion: ruta.fecha_creacion,
    fechaActualizacion: ruta.fecha_actualizacion,
  };
}

/**
 * Update an existing ruta
 */
export async function updateRuta(id: bigint, data: UpdateRutaInput, adminEmail: string) {
  const existing = await prisma.rutas.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Ruta no encontrada');
  }

  // Check for duplicate name if changing
  if (data.nombre && data.nombre !== existing.nombre) {
    const duplicate = await prisma.rutas.findFirst({
      where: { nombre: data.nombre, id: { not: id } },
    });

    if (duplicate) {
      throw new Error('Ya existe una ruta con ese nombre');
    }
  }

  const datosAnteriores = {
    nombre: existing.nombre,
    descripcion: existing.descripcion,
  };

  const ruta = await prisma.rutas.update({
    where: { id },
    data: {
      ...(data.nombre !== undefined && { nombre: data.nombre }),
      ...(data.descripcion !== undefined && { descripcion: data.descripcion }),
      fecha_actualizacion: new Date(),
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'EDITAR_RUTA',
      entidad: 'rutas',
      entidad_id: ruta.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: datosAnteriores,
      datos_nuevos: {
        nombre: ruta.nombre,
        descripcion: ruta.descripcion,
      },
    },
  });

  return {
    id: ruta.id.toString(),
    nombre: ruta.nombre,
    descripcion: ruta.descripcion,
    fechaCreacion: ruta.fecha_creacion,
    fechaActualizacion: ruta.fecha_actualizacion,
  };
}

/**
 * Delete a ruta (only if no direcciones are associated)
 */
export async function deleteRuta(id: bigint, adminEmail: string) {
  const existing = await prisma.rutas.findUnique({
    where: { id },
    include: {
      _count: {
        select: { direcciones: true },
      },
    },
  });

  if (!existing) {
    throw new Error('Ruta no encontrada');
  }

  if (existing._count.direcciones > 0) {
    throw new Error(
      `No se puede eliminar: hay ${existing._count.direcciones} direcciones asociadas a esta ruta`
    );
  }

  await prisma.rutas.delete({ where: { id } });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'ELIMINAR_RUTA',
      entidad: 'rutas',
      entidad_id: id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: {
        nombre: existing.nombre,
        descripcion: existing.descripcion,
      },
    },
  });

  return { success: true, message: 'Ruta eliminada correctamente' };
}

/**
 * Get all direcciones for a specific ruta
 */
export async function getDireccionesByRuta(rutaId: bigint, page: number = 1, limit: number = 50) {
  const skip = (page - 1) * limit;

  const [direcciones, total] = await Promise.all([
    prisma.direcciones.findMany({
      where: { ruta_id: rutaId },
      orderBy: { orden_ruta: 'asc' },
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
        medidores: {
          where: { estado: 'activo' },
          select: { id: true, numero_serie: true },
        },
      },
    }),
    prisma.direcciones.count({ where: { ruta_id: rutaId } }),
  ]);

  return {
    direcciones: direcciones.map((d) => ({
      id: d.id.toString(),
      clienteId: d.cliente_id.toString(),
      clienteNumero: d.cliente.numero_cliente,
      clienteNombre: `${d.cliente.primer_nombre} ${d.cliente.primer_apellido}`,
      direccion: `${d.direccion_calle} ${d.direccion_numero || ''}`.trim(),
      poblacion: d.poblacion,
      comuna: d.comuna,
      ordenRuta: d.orden_ruta,
      tienesMedidores: d.medidores.length,
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
 * Reassign direcciones to a different ruta
 */
export async function reassignDirecciones(
  direccionIds: string[],
  newRutaId: bigint,
  adminEmail: string
) {
  // Validate new ruta exists
  const newRuta = await prisma.rutas.findUnique({ where: { id: newRutaId } });
  if (!newRuta) {
    throw new Error('Ruta destino no encontrada');
  }

  // Get current max orden_ruta in the target ruta
  const maxOrden = await prisma.direcciones.aggregate({
    where: { ruta_id: newRutaId },
    _max: { orden_ruta: true },
  });
  let nextOrden = (maxOrden._max.orden_ruta || 0) + 1;

  // Update each direccion
  const bigintIds = direccionIds.map((id) => BigInt(id));

  const updated = await prisma.$transaction(
    bigintIds.map((id, index) =>
      prisma.direcciones.update({
        where: { id },
        data: {
          ruta_id: newRutaId,
          orden_ruta: nextOrden + index,
        },
      })
    )
  );

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'REASIGNAR_DIRECCIONES',
      entidad: 'rutas',
      entidad_id: newRutaId,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: {
        direccionesMovidas: direccionIds.length,
        rutaDestino: newRuta.nombre,
      },
    },
  });

  return {
    success: true,
    message: `${updated.length} direcciones reasignadas a ${newRuta.nombre}`,
    count: updated.length,
  };
}

/**
 * Update orden_ruta for a direccion
 */
export async function updateDireccionOrden(
  direccionId: bigint,
  newOrden: number,
  adminEmail: string
) {
  const direccion = await prisma.direcciones.findUnique({ where: { id: direccionId } });
  if (!direccion) {
    throw new Error('Dirección no encontrada');
  }

  await prisma.direcciones.update({
    where: { id: direccionId },
    data: { orden_ruta: newOrden },
  });

  return { success: true, message: 'Orden actualizado' };
}
