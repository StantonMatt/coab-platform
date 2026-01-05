import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { NotaCreditoInfo } from '../types';

export async function calculateSaldoAnterior(
  prisma: PrismaClient,
  cliente: any,
  periodoInicio: Date,
  periodoFin: Date,
  yearMonth: string
): Promise<Decimal> {
  let saldoAnteriorBase = new Decimal(0);
  
  // Check if this is January 2024 (first month with new system)
  const isFirstMonth = yearMonth === '2024-01';
  
  if (isFirstMonth) {
    // For January 2024, get saldo from saldos_iniciales table
    const saldoInicial = await prisma.saldos_iniciales.findFirst({
      where: { cliente_id: cliente.id }
    });
    
    if (saldoInicial) {
      saldoAnteriorBase = new Decimal(saldoInicial.monto_saldo);
      const prefix = saldoAnteriorBase.lt(0) ? '  💳 Saldo a favor (inicial)' : '  📋 Saldo anterior (inicial)';
      console.log(`${prefix}: $${saldoAnteriorBase.toFixed(0)}`);
    }
  } else {
    // For other months, get the previous month's boleta and calculate remaining debt
    const prevMonth = new Date(periodoInicio);
    prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
    const prevMonthStart = new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth(), 1));
    const prevMonthEnd = new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth() + 1, 0));
    
    const boletaAnterior = await prisma.boletas.findFirst({
      where: {
        cliente_id: cliente.id,
        periodo_desde: prevMonthStart,
        periodo_hasta: prevMonthEnd
      }
    });
    
    if (boletaAnterior) {
      // Start with the previous month's total
      saldoAnteriorBase = new Decimal(boletaAnterior.monto_total);
      
      // Subtract any payments made during the current month (payments for the previous month's bill)
      // Clients receive their bill at the beginning of the month and pay during that month
      const pagosAplicados = await prisma.pagos.aggregate({
        _sum: { monto: true },
        where: {
          cliente_id: cliente.id,
          fecha_pago: {
            gte: periodoInicio,  // Payments made during current month
            lte: periodoFin      // Up to the end of current month
          },
          estado: 'completado'
        }
      });
      
      const montoPagado = new Decimal(pagosAplicados._sum.monto || 0);
      saldoAnteriorBase = saldoAnteriorBase.minus(montoPagado);
      
      // If they overpaid, they have a credit balance (negative saldo)
      if (!saldoAnteriorBase.isZero()) {
        const prefix = saldoAnteriorBase.lt(0) ? '  💳 Saldo a favor' : '  📋 Saldo anterior';
        console.log(`${prefix}: $${saldoAnteriorBase.toFixed(0)}`);
      }
    }
  }
  
  return saldoAnteriorBase;
}

export async function applyNotasDeCredito(
  prisma: PrismaClient,
  cliente: any,
  periodoInicio: Date,
  yearMonth: string
): Promise<NotaCreditoInfo> {
  let montoNotaCredito = new Decimal(0);
  let notasAplicables: any[] = [];
  
  // For January 2024, skip notas de crédito entirely (first month of new system)
  const isFirstMonth = yearMonth === '2024-01';
  
  if (!isFirstMonth) {
    // Nota de crédito represents money already refunded to the client's bank account
    // They need to "pay it back" through future bills, so we ADD it to saldo anterior
    const notasCredito = await prisma.notas_de_credito.findMany({
      where: {
        cliente_id: cliente.id,
        aplicado: false,  // Changed from estado: 'pendiente'
        fecha_emision: { lt: periodoInicio } // Apply credits from before this period
      }
    });
    
    notasAplicables = notasCredito;
    
    for (const nota of notasAplicables) {
      montoNotaCredito = montoNotaCredito.plus(nota.monto);
      console.log(`  📝 Aplicando nota de crédito: $${nota.monto} (dinero ya devuelto que deben repagar)`);
    }
  }
  
  return { montoNotaCredito, notasAplicables };
}