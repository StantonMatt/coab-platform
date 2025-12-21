/**
 * Billing Service - Single Source of Truth
 *
 * Centralized billing calculations used by:
 * - customer.service.ts (customer dashboard)
 * - admin.service.ts (admin panel)
 * - mercadopago.service.ts (payment processing)
 *
 * The billing model:
 * - monto_total in each boleta = monto_saldo_anterior + monto_total_mes (cumulative)
 * - Latest boleta's monto_total IS the current balance (already calculated by billing system)
 * - Payments made after a boleta's emission reduce what's owed
 *
 * The REVERSE FIFO approach:
 * - Current balance = latest boleta's monto_total - payments after its emission
 * - Work backwards from newest to oldest
 * - Each boleta that contributes to the current balance is "pendiente"
 * - Boletas whose monto_total_mes is fully covered by payments are "pagada"
 */

import { PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma.js';

// Type for transaction client
type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// ============================================================================
// Types
// ============================================================================

export interface FIFOResult {
  boletasActualizadas: number;
  boletasPagadas: number;
  boletasPendientes: number;
  saldoNuevo: number;
  creditoDisponible: number;
  detalles: Array<{
    boletaId: string;
    estadoAnterior: string;
    estadoNuevo: string;
    montoTotal: number;
  }>;
}

export interface PartialPaymentInfo {
  montoAdeudado: number;
  parcialmentePagada: boolean;
}

interface BoletaData {
  id: bigint;
  estado: string;
  monto_total_mes: string;
  periodo_desde: Date;
}

interface LatestBoletaData {
  monto_total: string;
  fecha_emision: Date;
}

interface PendingBoletaData {
  id: bigint;
  monto_total_mes: string;
  monto_total: string;
}

// ============================================================================
// Centralized Balance Calculation - Single Source of Truth
// ============================================================================

/**
 * Get current customer balance
 *
 * The billing system already tracks running balances in each boleta:
 * - monto_saldo_anterior = previous balance - payments received
 * - monto_total = monto_saldo_anterior + this month's charges
 *
 * So the CURRENT balance is:
 * - monto_total of the most recent boleta
 * - MINUS any payments made after that boleta was issued
 *
 * @param clienteId - Customer ID
 * @param tx - Optional transaction client
 * @returns Current balance (always >= 0)
 */
export async function getCurrentBalance(
  clienteId: bigint,
  tx?: TransactionClient
): Promise<number> {
  const db = tx || prisma;

  // Get the latest boleta (this contains the running balance)
  const latestBoleta = await db.boletas.findFirst({
    where: { cliente_id: clienteId },
    orderBy: { periodo_desde: 'desc' },
    select: {
      monto_total: true,
      fecha_emision: true,
    },
  });

  if (!latestBoleta) {
    return 0;
  }

  const baselineBalance = Number(latestBoleta.monto_total);

  // Get payments made AFTER the latest boleta was issued
  const paymentsAfterLatest = await db.pagos.aggregate({
    where: {
      cliente_id: clienteId,
      estado: 'completado',
      fecha_pago: { gt: latestBoleta.fecha_emision },
    },
    _sum: { monto: true },
  });

  const paymentsAfterLatestAmount = Number(paymentsAfterLatest._sum.monto || 0);

  // Current balance = latest boleta total - payments made after it
  return Math.max(0, baselineBalance - paymentsAfterLatestAmount);
}

/**
 * Get the next due date from pending boletas
 *
 * @param clienteId - Customer ID
 * @param tx - Optional transaction client
 * @returns Earliest due date or null if no pending boletas
 */
export async function getNextDueDate(
  clienteId: bigint,
  tx?: TransactionClient
): Promise<Date | null> {
  const db = tx || prisma;

  const nextBoleta = await db.boletas.findFirst({
    where: {
      cliente_id: clienteId,
      estado: 'pendiente',
    },
    orderBy: {
      fecha_vencimiento: 'asc',
    },
    select: {
      fecha_vencimiento: true,
    },
  });

  return nextBoleta?.fecha_vencimiento || null;
}

// ============================================================================
// Centralized Partial Payment Calculation - Single Source of Truth
// ============================================================================

/**
 * Calculate partial payment info for all pending boletas
 *
 * Uses REVERSE FIFO: newest boletas are owed first, oldest may be partially or fully paid.
 *
 * @param clienteId - Customer ID
 * @param tx - Optional transaction client
 * @returns Map of boleta ID to partial payment info, plus current balance
 */
export async function getBoletasPartialPaymentMap(
  clienteId: bigint,
  tx?: TransactionClient
): Promise<{ map: Map<string, PartialPaymentInfo>; saldoActual: number }> {
  const db = tx || prisma;

  // Get current balance
  const saldoActual = await getCurrentBalance(clienteId, tx);

  // Get all pending boletas ordered newest first (for reverse FIFO)
  const pendingBoletas = await db.$queryRaw<PendingBoletaData[]>`
    SELECT id, COALESCE(monto_total_mes, monto_total)::text as monto_total_mes, monto_total::text
    FROM boletas
    WHERE cliente_id = ${clienteId} AND estado = 'pendiente'
    ORDER BY periodo_desde DESC, id DESC
  `;

  const map = new Map<string, PartialPaymentInfo>();
  let remainingDebt = saldoActual;

  // Process from newest to oldest (reverse FIFO)
  for (const boleta of pendingBoletas) {
    const montoMes = Number(boleta.monto_total_mes);
    const montoAdeudado = Math.min(remainingDebt, montoMes);
    remainingDebt = Math.max(0, remainingDebt - montoMes);

    map.set(boleta.id.toString(), {
      montoAdeudado,
      parcialmentePagada: montoAdeudado > 0 && montoAdeudado < montoMes,
    });
  }

  return { map, saldoActual };
}

// ============================================================================
// FIFO Recalculation - Update Boleta Estados
// ============================================================================

/**
 * Recalculate and update boleta estados for a customer using REVERSE FIFO logic
 *
 * This function:
 * 1. Gets the current balance (latest boleta's monto_total - subsequent payments)
 * 2. Works backwards from newest to oldest boleta
 * 3. Marks boletas as pendiente if they contribute to current debt
 * 4. Marks boletas as pagada if their debt has been covered
 *
 * @param clienteId - Customer ID
 * @param tx - Optional transaction client for use within existing transactions
 * @returns Summary of changes made
 */
export async function recalculateBoletaEstados(
  clienteId: bigint,
  tx?: TransactionClient
): Promise<FIFOResult> {
  const db = tx || prisma;

  // 1. Get the latest boleta to determine current balance baseline
  const latestBoleta = await db.$queryRaw<LatestBoletaData[]>`
    SELECT monto_total::text, fecha_emision
    FROM boletas
    WHERE cliente_id = ${clienteId}
    ORDER BY periodo_desde DESC
    LIMIT 1
  `;

  if (latestBoleta.length === 0) {
    // No boletas for this customer
    return {
      boletasActualizadas: 0,
      boletasPagadas: 0,
      boletasPendientes: 0,
      saldoNuevo: 0,
      creditoDisponible: 0,
      detalles: [],
    };
  }

  const baselineBalance = Number(latestBoleta[0].monto_total);
  const latestEmission = latestBoleta[0].fecha_emision;

  // 2. Get payments made AFTER the latest boleta's emission
  const paymentsAfterLatest = await db.pagos.aggregate({
    where: {
      cliente_id: clienteId,
      estado: 'completado',
      fecha_pago: { gt: latestEmission },
    },
    _sum: { monto: true },
  });
  const paymentsAfterLatestAmount = Number(paymentsAfterLatest._sum.monto || 0);

  // 3. Calculate current balance
  const saldoActual = Math.max(0, baselineBalance - paymentsAfterLatestAmount);
  const creditoDisponible = Math.max(
    0,
    paymentsAfterLatestAmount - baselineBalance
  );

  // 4. Get all boletas ordered by periodo_desde DESC (newest first)
  const boletas = await db.$queryRaw<BoletaData[]>`
    SELECT 
      id,
      estado,
      COALESCE(monto_total_mes, monto_total)::text as monto_total_mes,
      periodo_desde
    FROM boletas
    WHERE cliente_id = ${clienteId}
    ORDER BY periodo_desde DESC, id DESC
  `;

  // 5. Apply reverse FIFO - work from newest to oldest
  const detalles: FIFOResult['detalles'] = [];
  let boletasActualizadas = 0;
  let boletasPagadas = 0;
  let boletasPendientes = 0;
  let deudaAcumuladaDesdeHoy = 0;

  for (const boleta of boletas) {
    const montoMes = Number(boleta.monto_total_mes);
    const estadoAnterior = boleta.estado;

    deudaAcumuladaDesdeHoy += montoMes;

    // A boleta is "pendiente" if:
    // - The cumulative from newest up to this point is <= current balance, OR
    // - This boleta partially contributes to current balance (cumulative - montoMes < saldoActual)
    let estadoCorrecto: string;
    if (deudaAcumuladaDesdeHoy <= saldoActual) {
      // Fully within current debt
      estadoCorrecto = 'pendiente';
    } else if (deudaAcumuladaDesdeHoy - montoMes < saldoActual) {
      // Partially contributes to current debt
      estadoCorrecto = 'pendiente';
    } else {
      // Fully covered by payments
      estadoCorrecto = 'pagada';
    }

    if (estadoCorrecto === 'pagada') {
      boletasPagadas++;
    } else {
      boletasPendientes++;
    }

    // Update if estado changed
    if (estadoAnterior !== estadoCorrecto) {
      await db.boletas.update({
        where: { id: boleta.id },
        data: {
          estado: estadoCorrecto,
          fecha_actualizacion: new Date(),
        },
      });

      boletasActualizadas++;
      detalles.push({
        boletaId: boleta.id.toString(),
        estadoAnterior,
        estadoNuevo: estadoCorrecto,
        montoTotal: montoMes,
      });
    }
  }

  return {
    boletasActualizadas,
    boletasPagadas,
    boletasPendientes,
    saldoNuevo: saldoActual,
    creditoDisponible,
    detalles,
  };
}

// ============================================================================
// Payment Creation with FIFO
// ============================================================================

/**
 * Create a payment record and apply FIFO logic
 * This is a helper that combines payment creation with FIFO recalculation
 */
export async function createPaymentAndApplyFIFO(
  tx: TransactionClient,
  clienteId: bigint,
  numeroCliente: string,
  monto: number,
  tipoPago: string,
  options?: {
    numeroTransaccion?: string;
    observaciones?: string;
    operador?: string;
  }
): Promise<{
  pago: { id: bigint; monto: number; fechaPago: Date };
  fifoResult: FIFOResult;
}> {
  // Create payment record
  const pago = await tx.pagos.create({
    data: {
      cliente_id: clienteId,
      numero_cliente: numeroCliente,
      monto: monto,
      fecha_pago: new Date(),
      tipo_pago: tipoPago,
      estado: 'completado',
      numero_transaccion: options?.numeroTransaccion || null,
      observaciones: options?.observaciones || null,
      operador: options?.operador || null,
      procesado: true,
    },
  });

  // Apply FIFO recalculation
  const fifoResult = await recalculateBoletaEstados(clienteId, tx);

  // Add overpayment note if applicable
  if (
    fifoResult.creditoDisponible > 0 &&
    !options?.observaciones?.includes('Saldo a favor')
  ) {
    const notaActual = options?.observaciones || '';
    const nuevaNota =
      `${notaActual}\n[Saldo a favor: $${fifoResult.creditoDisponible.toLocaleString('es-CL')}]`.trim();

    await tx.pagos.update({
      where: { id: pago.id },
      data: { observaciones: nuevaNota },
    });
  }

  return {
    pago: {
      id: pago.id,
      monto: Number(pago.monto),
      fechaPago: pago.fecha_pago,
    },
    fifoResult,
  };
}

