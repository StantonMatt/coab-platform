import prisma from '../lib/prisma.js';
import { validarRUT, formatearRUT, limpiarRUT } from '@coab/utils';
import type {
  UpdateClienteContactInput,
  UpdateClienteFullInput,
  UpdateDireccionInput,
} from '../schemas/clientes.schema.js';

/**
 * Update client contact info only (phone, email)
 * Available to billing_clerk and above
 */
export async function updateClienteContact(
  id: bigint,
  data: UpdateClienteContactInput,
  adminEmail: string
) {
  const existing = await prisma.clientes.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Cliente no encontrado');
  }

  const datosAnteriores = {
    telefono: existing.telefono,
    correo: existing.correo,
  };

  const cliente = await prisma.clientes.update({
    where: { id },
    data: {
      ...(data.telefono !== undefined && { telefono: data.telefono }),
      ...(data.correo !== undefined && { correo: data.correo }),
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'EDITAR_CLIENTE_CONTACTO',
      entidad: 'clientes',
      entidad_id: cliente.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: datosAnteriores,
      datos_nuevos: {
        telefono: cliente.telefono,
        correo: cliente.correo,
      },
    },
  });

  return { success: true, message: 'Contacto actualizado correctamente' };
}

/**
 * Update full client info
 * Available to supervisor and above
 */
export async function updateClienteFull(
  id: bigint,
  data: UpdateClienteFullInput,
  adminEmail: string
) {
  const existing = await prisma.clientes.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Cliente no encontrado');
  }

  // Validate RUT if provided
  let rutToSave = undefined;
  if (data.rut !== undefined) {
    if (data.rut) {
      const cleanRut = limpiarRUT(data.rut);
      if (!validarRUT(cleanRut)) {
        throw new Error('RUT inválido');
      }
      
      // Check for duplicate RUT
      const duplicate = await prisma.clientes.findFirst({
        where: {
          rut: cleanRut,
          id: { not: id },
        },
      });
      
      if (duplicate) {
        throw new Error('Ya existe un cliente con ese RUT');
      }
      
      rutToSave = cleanRut;
    } else {
      rutToSave = null;
    }
  }

  const datosAnteriores = {
    telefono: existing.telefono,
    correo: existing.correo,
    primer_nombre: existing.primer_nombre,
    segundo_nombre: existing.segundo_nombre,
    primer_apellido: existing.primer_apellido,
    segundo_apellido: existing.segundo_apellido,
    rut: existing.rut,
    recibe_factura: existing.recibe_factura,
    nombre_pagante: existing.nombre_pagante,
    excluir_cargo_fijo: existing.excluir_cargo_fijo,
    es_cliente_actual: existing.es_cliente_actual,
  };

  const cliente = await prisma.clientes.update({
    where: { id },
    data: {
      ...(data.telefono !== undefined && { telefono: data.telefono }),
      ...(data.correo !== undefined && { correo: data.correo }),
      ...(data.primerNombre !== undefined && { primer_nombre: data.primerNombre }),
      ...(data.segundoNombre !== undefined && { segundo_nombre: data.segundoNombre }),
      ...(data.primerApellido !== undefined && { primer_apellido: data.primerApellido }),
      ...(data.segundoApellido !== undefined && { segundo_apellido: data.segundoApellido }),
      ...(rutToSave !== undefined && { rut: rutToSave }),
      ...(data.recibeFactura !== undefined && { recibe_factura: data.recibeFactura }),
      ...(data.nombrePagante !== undefined && { nombre_pagante: data.nombrePagante }),
      ...(data.excluirCargoFijo !== undefined && { excluir_cargo_fijo: data.excluirCargoFijo }),
      ...(data.esClienteActual !== undefined && { es_cliente_actual: data.esClienteActual }),
    },
  });

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'EDITAR_CLIENTE_COMPLETO',
      entidad: 'clientes',
      entidad_id: cliente.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: datosAnteriores,
      datos_nuevos: {
        telefono: cliente.telefono,
        correo: cliente.correo,
        primer_nombre: cliente.primer_nombre,
        segundo_nombre: cliente.segundo_nombre,
        primer_apellido: cliente.primer_apellido,
        segundo_apellido: cliente.segundo_apellido,
        rut: cliente.rut,
        recibe_factura: cliente.recibe_factura,
        nombre_pagante: cliente.nombre_pagante,
        excluir_cargo_fijo: cliente.excluir_cargo_fijo,
        es_cliente_actual: cliente.es_cliente_actual,
      },
    },
  });

  return {
    success: true,
    message: 'Cliente actualizado correctamente',
    rut: cliente.rut ? formatearRUT(cliente.rut) : null,
  };
}

/**
 * Update client's primary address
 */
export async function updateClienteDireccion(
  clienteId: bigint,
  data: UpdateDireccionInput,
  adminEmail: string
) {
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
    include: { direcciones: { take: 1, orderBy: { id: 'asc' } } },
  });

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  const existingDireccion = cliente.direcciones[0];
  const datosAnteriores = existingDireccion
    ? {
        direccion: existingDireccion.direccion,
        ciudad: existingDireccion.ciudad,
        comuna: existingDireccion.comuna,
        region: existingDireccion.region,
      }
    : null;

  let direccion;

  if (existingDireccion) {
    // Update existing
    direccion = await prisma.direcciones.update({
      where: { id: existingDireccion.id },
      data: {
        direccion: data.direccion,
        ciudad: data.ciudad || null,
        comuna: data.comuna || null,
        region: data.region || null,
      },
    });
  } else {
    // Create new
    direccion = await prisma.direcciones.create({
      data: {
        cliente_id: clienteId,
        numero_cliente: cliente.numero_cliente,
        direccion: data.direccion,
        ciudad: data.ciudad || null,
        comuna: data.comuna || null,
        region: data.region || null,
      },
    });
  }

  // Audit log
  await prisma.log_auditoria.create({
    data: {
      accion: existingDireccion ? 'EDITAR_DIRECCION' : 'CREAR_DIRECCION',
      entidad: 'direcciones',
      entidad_id: direccion.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: datosAnteriores,
      datos_nuevos: {
        direccion: direccion.direccion,
        ciudad: direccion.ciudad,
        comuna: direccion.comuna,
        region: direccion.region,
      },
    },
  });

  return { success: true, message: 'Dirección actualizada correctamente' };
}

/**
 * Get all cliente info for editing
 */
export async function getClienteForEdit(id: bigint) {
  const cliente = await prisma.clientes.findUnique({
    where: { id },
    include: {
      direcciones: { take: 1, orderBy: { id: 'asc' } },
    },
  });

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  const direccion = cliente.direcciones[0];

  return {
    id: cliente.id.toString(),
    numeroCliente: cliente.numero_cliente,
    primerNombre: cliente.primer_nombre,
    segundoNombre: cliente.segundo_nombre,
    primerApellido: cliente.primer_apellido,
    segundoApellido: cliente.segundo_apellido,
    rut: cliente.rut ? formatearRUT(cliente.rut) : null,
    telefono: cliente.telefono,
    correo: cliente.correo,
    recibeFactura: cliente.recibe_factura,
    nombrePagante: cliente.nombre_pagante,
    excluirCargoFijo: cliente.excluir_cargo_fijo,
    esClienteActual: cliente.es_cliente_actual,
    direccion: direccion
      ? {
          id: direccion.id.toString(),
          direccion: direccion.direccion,
          ciudad: direccion.ciudad,
          comuna: direccion.comuna,
          region: direccion.region,
        }
      : null,
  };
}


