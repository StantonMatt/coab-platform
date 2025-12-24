import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import type { PaymentInput } from '../schemas/payment.schema.js';
import { env } from '../config/env.js';
import {
  getCurrentBalance,
  getBoletasPartialPaymentMap,
  recalculateBoletaEstados,
} from './billing.service.js';

/**
 * Helper to build full name from parts
 */
function buildFullName(
  primerNombre: string,
  segundoNombre: string | null,
  primerApellido: string,
  segundoApellido: string | null
): string {
  return [primerNombre, segundoNombre, primerApellido, segundoApellido]
    .filter(Boolean)
    .join(' ');
}

/**
 * Search customers by RUT, name parts, numero_cliente, or address
 * Uses case-insensitive matching
 */
export async function searchCustomers(
  query: string,
  limit: number = 50,
  cursor?: string
) {
  // Sanitize query (remove special regex chars)
  const sanitizedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build search conditions for name parts
  const searchConditions = [
    { rut: { contains: sanitizedQuery, mode: 'insensitive' as const } },
    {
      numero_cliente: { contains: sanitizedQuery, mode: 'insensitive' as const },
    },
    {
      primer_nombre: { contains: sanitizedQuery, mode: 'insensitive' as const },
    },
    {
      segundo_nombre: { contains: sanitizedQuery, mode: 'insensitive' as const },
    },
    {
      primer_apellido: { contains: sanitizedQuery, mode: 'insensitive' as const },
    },
    {
      segundo_apellido: {
        contains: sanitizedQuery,
        mode: 'insensitive' as const,
      },
    },
  ];

  const customers = await prisma.clientes.findMany({
    where: {
      es_cliente_actual: true,
      OR: searchConditions,
    },
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { primer_apellido: 'asc' },
    select: {
      id: true,
      rut: true,
      numero_cliente: true,
      primer_nombre: true,
      segundo_nombre: true,
      primer_apellido: true,
      segundo_apellido: true,
      correo: true,
      telefono: true,
      estado_cuenta: true,
      bloqueado_hasta: true,
      direcciones: {
        take: 1,
        select: {
          direccion_calle: true,
          direccion_numero: true,
          poblacion: true,
        },
      },
    },
  });

  const hasNextPage = customers.length > limit;
  const data = hasNextPage ? customers.slice(0, -1) : customers;
  const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

  // Get balances using centralized billing service (parallel for performance)
  const balances = await Promise.all(
    data.map((c) => getCurrentBalance(c.id))
  );

  // Create a map for quick lookup
  const saldoMap = new Map<bigint, number>();
  data.forEach((customer, index) => {
    saldoMap.set(customer.id, balances[index]);
  });

  // Transform data with saldos from the map
  const customersWithSaldo = data.map((customer) => {
    const saldo = saldoMap.get(customer.id) || 0;
    const direccion = customer.direcciones[0];
    const direccionStr = direccion
      ? `${direccion.direccion_calle} ${direccion.direccion_numero || ''}, ${direccion.poblacion}`.trim()
      : null;

    return {
      id: customer.id.toString(),
      rut: customer.rut,
      numeroCliente: customer.numero_cliente,
      nombre: buildFullName(
        customer.primer_nombre,
        customer.segundo_nombre,
        customer.primer_apellido,
        customer.segundo_apellido
      ),
      direccion: direccionStr,
      telefono: customer.telefono,
      email: customer.correo,
      saldo,
      estadoCuenta: saldo > 0 ? 'MOROSO' : 'AL_DIA',
      estaBloqueado:
        customer.bloqueado_hasta !== null &&
        customer.bloqueado_hasta > new Date(),
    };
  });

  return {
    data: customersWithSaldo,
    pagination: {
      hasNextPage,
      nextCursor,
      total: customersWithSaldo.length,
    },
  };
}

/**
 * Get full customer profile for admin view
 * Includes computed saldo and address
 * Uses centralized billing service for balance calculation
 */
export async function getCustomerProfile(clienteId: bigint) {
  const customer = await prisma.clientes.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      rut: true,
      numero_cliente: true,
      primer_nombre: true,
      segundo_nombre: true,
      primer_apellido: true,
      segundo_apellido: true,
      correo: true,
      telefono: true,
      estado_cuenta: true,
      bloqueado_hasta: true,
      intentos_fallidos: true,
      hash_contrasena: true,
      ultimo_inicio_sesion: true,
      fecha_creacion: true,
      es_cliente_actual: true,
      direcciones: {
        take: 1,
        select: {
          direccion_calle: true,
          direccion_numero: true,
          poblacion: true,
          comuna: true,
        },
      },
    },
  });

  if (!customer) {
    throw new Error('Cliente no encontrado');
  }

  // Use centralized balance calculation
  const saldo = await getCurrentBalance(clienteId);

  const direccion = customer.direcciones[0];
  const direccionStr = direccion
    ? `${direccion.direccion_calle} ${direccion.direccion_numero || ''}, ${direccion.poblacion}, ${direccion.comuna}`.trim()
    : null;

  return {
    id: customer.id.toString(),
    rut: customer.rut,
    numeroCliente: customer.numero_cliente,
    nombre: buildFullName(
      customer.primer_nombre,
      customer.segundo_nombre,
      customer.primer_apellido,
      customer.segundo_apellido
    ),
    email: customer.correo,
    telefono: customer.telefono,
    direccion: direccionStr,
    saldo,
    estadoCuenta: saldo > 0 ? 'MOROSO' : 'AL_DIA',
    estaBloqueado:
      customer.bloqueado_hasta !== null &&
      customer.bloqueado_hasta > new Date(),
    bloqueadoHasta: customer.bloqueado_hasta,
    intentosFallidos: customer.intentos_fallidos,
    tieneContrasena: !!customer.hash_contrasena,
    ultimoInicioSesion: customer.ultimo_inicio_sesion,
    fechaCreacion: customer.fecha_creacion,
    esClienteActual: customer.es_cliente_actual,
  };
}

/**
 * Get customer payment history (admin view)
 */
export async function getCustomerPayments(
  clienteId: bigint,
  limit: number = 50,
  cursor?: string
) {
  const payments = await prisma.pagos.findMany({
    where: { cliente_id: clienteId },
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { fecha_pago: 'desc' },
    select: {
      id: true,
      monto: true,
      fecha_pago: true,
      tipo_pago: true,
      estado: true,
      numero_transaccion: true,
      operador: true,
      observaciones: true,
    },
  });

  const hasNextPage = payments.length > limit;
  const data = hasNextPage ? payments.slice(0, -1) : payments;
  const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

  return {
    data: data.map((p) => ({
      id: p.id.toString(),
      monto: Number(p.monto),
      fechaPago: p.fecha_pago,
      tipoPago: p.tipo_pago,
      estado: p.estado,
      numeroTransaccion: p.numero_transaccion,
      operador: p.operador,
      observaciones: p.observaciones,
    })),
    pagination: { hasNextPage, nextCursor },
  };
}

/**
 * Get customer boletas (admin view)
 * Returns monto_total_mes (individual month) for display
 * Also calculates partial payment status for pending boletas
 * Uses centralized billing service for calculations
 */
export async function getCustomerBoletas(
  clienteId: bigint,
  limit: number = 50,
  cursor?: string
) {
  // Use centralized partial payment calculation
  const { map: partialPaymentMap } =
    await getBoletasPartialPaymentMap(clienteId);

  // Get paginated boletas
  const boletas = await prisma.boletas.findMany({
    where: { cliente_id: clienteId },
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { fecha_emision: 'desc' },
    select: {
      id: true,
      numero_folio: true,
      periodo_desde: true,
      periodo_hasta: true,
      fecha_emision: true,
      fecha_vencimiento: true,
      monto_total: true,
      monto_total_mes: true, // Individual month's charges
      estado: true,
      consumo_m3: true,
      pdf_path: true, // For checking if PDF exists
    },
  });

  const hasNextPage = boletas.length > limit;
  const data = hasNextPage ? boletas.slice(0, -1) : boletas;
  const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

  return {
    data: data.map((b) => {
      const partialInfo = partialPaymentMap.get(b.id.toString());
      const montoMes = Number(b.monto_total_mes || b.monto_total);

      return {
        id: b.id.toString(),
        numeroFolio: b.numero_folio,
        periodoDesde: b.periodo_desde,
        periodoHasta: b.periodo_hasta,
        fechaEmision: b.fecha_emision,
        fechaVencimiento: b.fecha_vencimiento,
        // Use monto_total_mes (individual month) for display
        montoTotal: montoMes,
        montoTotalAcumulado: Number(b.monto_total), // Keep cumulative for reference
        estado: b.estado,
        // Add partial payment info for pending boletas
        montoAdeudado:
          b.estado === 'pendiente'
            ? (partialInfo?.montoAdeudado ?? montoMes)
            : 0,
        parcialmentePagada: partialInfo?.parcialmentePagada ?? false,
        consumoM3: b.consumo_m3 ? Number(b.consumo_m3) : null,
        tienePdf: !!b.pdf_path, // Indicates if PDF was generated
      };
    }),
    pagination: { hasNextPage, nextCursor },
  };
}

/**
 * Unlock a customer account
 * Resets failed login attempts and clears lockout
 * @param clienteId - Customer ID to unlock
 * @param adminEmail - Admin who performed the action (for audit log)
 */
export async function unlockCustomerAccount(
  clienteId: bigint,
  adminEmail: string
) {
  // Find the customer
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
  });

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  // Store previous state for audit log
  const datosAnteriores = {
    intentos_fallidos: cliente.intentos_fallidos,
    bloqueado_hasta: cliente.bloqueado_hasta,
    estado_cuenta: cliente.estado_cuenta,
  };

  // Unlock the account
  await prisma.clientes.update({
    where: { id: clienteId },
    data: {
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      estado_cuenta:
        cliente.estado_cuenta === 'bloqueada' ? 'activa' : cliente.estado_cuenta,
    },
  });

  // Create audit log entry
  await prisma.log_auditoria.create({
    data: {
      accion: 'DESBLOQUEO_CUENTA',
      entidad: 'clientes',
      entidad_id: clienteId,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: datosAnteriores,
      datos_nuevos: {
        intentos_fallidos: 0,
        bloqueado_hasta: null,
        estado_cuenta: 'activa',
      },
    },
  });

  return {
    message: 'Cuenta desbloqueada exitosamente',
    clienteId: clienteId.toString(),
  };
}

/**
 * Get customer by ID for admin view
 * Returns basic customer info for admin panel
 */
export async function getCustomerById(clienteId: bigint) {
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      rut: true,
      numero_cliente: true,
      primer_nombre: true,
      segundo_nombre: true,
      primer_apellido: true,
      segundo_apellido: true,
      correo: true,
      telefono: true,
      estado_cuenta: true,
      intentos_fallidos: true,
      bloqueado_hasta: true,
      ultimo_inicio_sesion: true,
    },
  });

  if (!cliente) {
    return null;
  }

  // Build full name
  const nombre = [
    cliente.primer_nombre,
    cliente.segundo_nombre,
    cliente.primer_apellido,
    cliente.segundo_apellido,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    id: cliente.id.toString(),
    rut: cliente.rut,
    numeroCliente: cliente.numero_cliente,
    nombre,
    email: cliente.correo,
    telefono: cliente.telefono,
    estadoCuenta: cliente.estado_cuenta,
    intentosFallidos: cliente.intentos_fallidos,
    bloqueadoHasta: cliente.bloqueado_hasta,
    ultimoInicioSesion: cliente.ultimo_inicio_sesion,
    estaBloqueado:
      cliente.bloqueado_hasta !== null &&
      cliente.bloqueado_hasta > new Date(),
  };
}

/**
 * Register a manual payment with FIFO application to boletas
 * Uses database transaction with row-level locking for concurrent safety
 *
 * @param data - Payment input data
 * @param operadorEmail - Admin email who registered the payment
 * @param ipAddress - Client IP for audit
 * @param userAgent - User agent for audit
 * @param logger - Fastify logger instance
 */
export async function registrarPago(
  data: PaymentInput,
  operadorEmail: string,
  ipAddress: string,
  userAgent: string,
  logger: {
    info: (msg: string, data?: object) => void;
    error: (msg: string, data?: object) => void;
  }
) {
  const clienteId = BigInt(data.clienteId);

  try {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Verify customer exists and get basic info
        const cliente = await tx.clientes.findUnique({
          where: { id: clienteId },
          select: {
            id: true,
            rut: true,
            numero_cliente: true,
            primer_nombre: true,
            primer_apellido: true,
          },
        });

        if (!cliente) {
          throw new Error('Cliente no encontrado');
        }

        // Calculate current balance before payment
        const saldoAnteriorResult = await tx.boletas.aggregate({
          where: {
            cliente_id: clienteId,
            estado: 'pendiente',
          },
          _sum: { monto_total: true },
        });
        const saldoAnterior = Number(saldoAnteriorResult._sum.monto_total || 0);

        // 2. Create payment record in pagos table
        const pago = await tx.pagos.create({
          data: {
            cliente_id: clienteId,
            numero_cliente: cliente.numero_cliente,
            monto: data.monto,
            fecha_pago: new Date(),
            tipo_pago: data.tipoPago,
            estado: 'completado',
            numero_transaccion: data.numeroTransaccion || null,
            observaciones: data.observaciones || null,
            operador: operadorEmail,
            procesado: true,
          },
        });

        // 3. Apply FIFO payment logic using centralized billing service
        const fifoResult = await recalculateBoletaEstados(clienteId, tx);

        // Convert FIFO result to boletasAfectadas format for response
        const boletasAfectadas = fifoResult.detalles.map((d) => ({
          boletaId: d.boletaId,
          montoAplicado: d.montoTotal,
          tipo: 'completo' as const,
        }));

        // 4. If customer has credit (overpayment), note it on the payment
        if (fifoResult.creditoDisponible > 0) {
          const observacionesFinal =
            `${data.observaciones || ''}\n[Saldo a favor: $${fifoResult.creditoDisponible.toLocaleString('es-CL')}]`.trim();

          await tx.pagos.update({
            where: { id: pago.id },
            data: { observaciones: observacionesFinal },
          });
        }

        const saldoNuevo = fifoResult.saldoNuevo;

        // 5. Create audit log entry
        await tx.log_auditoria.create({
          data: {
            accion: 'REGISTRO_PAGO',
            entidad: 'pagos',
            entidad_id: pago.id,
            usuario_tipo: 'admin',
            usuario_email: operadorEmail,
            datos_anteriores: {
              saldoAnterior: saldoAnterior,
            },
            datos_nuevos: {
              pagoId: pago.id.toString(),
              monto: data.monto,
              tipoPago: data.tipoPago,
              boletasActualizadas: fifoResult.boletasActualizadas,
              saldoNuevo: saldoNuevo,
              saldoAFavor: fifoResult.creditoDisponible,
            },
            ip_address: ipAddress,
            user_agent: userAgent,
          },
        });

        logger.info('Payment successfully applied', {
          clienteId: clienteId.toString(),
          clienteRut: cliente.rut,
          monto: data.monto,
          boletasActualizadas: fifoResult.boletasActualizadas,
          creditoDisponible: fifoResult.creditoDisponible,
          operador: operadorEmail,
        });

        // Build customer full name
        const nombreCliente = `${cliente.primer_nombre} ${cliente.primer_apellido}`;

        return {
          pago: {
            id: pago.id.toString(),
            monto: Number(pago.monto),
            fechaPago: pago.fecha_pago,
            tipoPago: pago.tipo_pago,
            referenciaExterna: pago.numero_transaccion,
            observaciones: pago.observaciones,
            operador: pago.operador,
          },
          cliente: {
            id: cliente.id.toString(),
            rut: cliente.rut,
            nombre: nombreCliente,
          },
          boletasAfectadas,
          creditoDisponible: fifoResult.creditoDisponible,
          saldoNuevo,
        };
      },
      {
        // Transaction options for better isolation
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000, // 5 seconds max wait
        timeout: 10000, // 10 seconds timeout
      }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('Payment application failed - transaction rolled back', {
      clienteId: data.clienteId,
      monto: data.monto,
      tipoPago: data.tipoPago,
      operador: operadorEmail,
      error: errorMessage,
      stack: errorStack,
    });

    // Re-throw with user-friendly message
    if (errorMessage === 'Cliente no encontrado') {
      throw error;
    }

    throw new Error(
      'Error al procesar pago. No se realizaron cambios. Por favor intente nuevamente.'
    );
  }
}

/**
 * Generate a password setup token for a customer
 * Creates a cryptographically secure token with 48-hour expiry
 *
 * @param clienteId - Customer ID
 * @param adminEmail - Admin who generated the token (for audit)
 * @param ipAddress - IP address of the request
 */
export async function generateSetupToken(
  clienteId: bigint,
  adminEmail: string,
  ipAddress: string
) {
  // Find customer
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      rut: true,
      primer_nombre: true,
      segundo_nombre: true,
      primer_apellido: true,
      segundo_apellido: true,
      telefono: true,
      hash_contrasena: true,
    },
  });

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  // Generate cryptographically secure token (256-bit / 32 bytes)
  const token = crypto.randomBytes(32).toString('hex');

  // Delete any existing unused tokens for this customer
  await prisma.token_configuracion.deleteMany({
    where: {
      cliente_id: clienteId,
      usado: false,
    },
  });

  // Create new token with 48-hour expiry
  const tokenRecord = await prisma.token_configuracion.create({
    data: {
      cliente_id: clienteId,
      token: token,
      tipo: 'setup',
      usado: false,
      expira_en: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
      ip_creacion: ipAddress,
    },
  });

  // Build setup URL
  const setupUrl = `${env.FRONTEND_URL}/setup/${token}`;

  // Build full name
  const nombreCompleto = buildFullName(
    cliente.primer_nombre,
    cliente.segundo_nombre,
    cliente.primer_apellido,
    cliente.segundo_apellido
  );

  // Create audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'GENERAR_TOKEN_SETUP',
      entidad: 'token_configuracion',
      entidad_id: tokenRecord.id,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_nuevos: {
        clienteId: clienteId.toString(),
        clienteRut: cliente.rut,
        tokenExpiry: tokenRecord.expira_en.toISOString(),
      },
      ip_address: ipAddress,
    },
  });

  return {
    token,
    setupUrl,
    cliente: {
      id: cliente.id.toString(),
      rut: cliente.rut,
      nombre: nombreCompleto,
      telefono: cliente.telefono,
      tieneContrasena: !!cliente.hash_contrasena,
    },
    expiresAt: tokenRecord.expira_en,
  };
}

/**
 * Get all payments with filters, search, and pagination
 */
export async function getAllPayments(options: {
  page: number;
  limit: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  tipoPago?: string;
  estado?: string;
  search?: string;
}) {
  const { page, limit, fechaDesde, fechaHasta, tipoPago, estado, search } = options;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.pagosWhereInput = {};

  // Date range filter
  if (fechaDesde || fechaHasta) {
    where.fecha_pago = {};
    if (fechaDesde) {
      where.fecha_pago.gte = fechaDesde;
    }
    if (fechaHasta) {
      where.fecha_pago.lte = fechaHasta;
    }
  }

  // Payment type filter
  if (tipoPago) {
    where.tipo_pago = tipoPago;
  }

  // Status filter
  if (estado) {
    where.estado = estado;
  }

  // Search filter (customer name, RUT, or transaction number)
  if (search) {
    const cleanSearch = search.replace(/[.\-]/g, '').toUpperCase();
    where.OR = [
      { numero_transaccion: { contains: search, mode: 'insensitive' } },
      { nombre_cliente: { contains: search, mode: 'insensitive' } },
      { rut_cliente: { contains: cleanSearch, mode: 'insensitive' } },
      {
        cliente: {
          OR: [
            { primer_nombre: { contains: search, mode: 'insensitive' } },
            { primer_apellido: { contains: search, mode: 'insensitive' } },
            { rut: { contains: cleanSearch, mode: 'insensitive' } },
            { numero_cliente: { contains: search, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  // Execute queries in parallel
  const [pagos, total, aggregate] = await Promise.all([
    // Get paginated payments
    prisma.pagos.findMany({
      where,
      include: {
        cliente: {
          select: {
            id: true,
            primer_nombre: true,
            segundo_nombre: true,
            primer_apellido: true,
            segundo_apellido: true,
            rut: true,
            numero_cliente: true,
          },
        },
      },
      orderBy: { fecha_pago: 'desc' },
      skip,
      take: limit,
    }),
    // Get total count
    prisma.pagos.count({ where }),
    // Get sum of amounts for the filtered results
    prisma.pagos.aggregate({
      where,
      _sum: { monto: true },
      _count: true,
    }),
  ]);

  // Transform results
  const transformedPagos = pagos.map((pago) => ({
    id: pago.id.toString(),
    monto: Number(pago.monto),
    fechaPago: pago.fecha_pago.toISOString().split('T')[0],
    tipoPago: pago.tipo_pago,
    estado: pago.estado,
    numeroTransaccion: pago.numero_transaccion,
    observaciones: pago.observaciones,
    operador: pago.operador,
    cliente: pago.cliente
      ? {
          id: pago.cliente.id.toString(),
          nombre: buildFullName(
            pago.cliente.primer_nombre,
            pago.cliente.segundo_nombre,
            pago.cliente.primer_apellido,
            pago.cliente.segundo_apellido
          ),
          rut: pago.cliente.rut || '',
          numeroCliente: pago.cliente.numero_cliente,
        }
      : null,
  }));

  return {
    pagos: transformedPagos,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    resumen: {
      totalMonto: Number(aggregate._sum.monto || 0),
      cantidadPagos: aggregate._count,
    },
  };
}
