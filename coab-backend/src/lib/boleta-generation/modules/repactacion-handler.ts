import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { RepactacionInfo } from '../types';

export async function calculateRepactacion(
  prisma: PrismaClient,
  cliente: any,
  periodoInicio: Date,
  periodoFin: Date
): Promise<RepactacionInfo> {
  let montoRepactacion = new Decimal(0);
  let repactacionId: bigint | null = null;
  
  const repactacion = await prisma.repactaciones.findFirst({
    where: {
      cliente_id: cliente.id,
      fecha_inicio: { lte: periodoFin },
      OR: [
        { fecha_termino_real: null },
        { fecha_termino_real: { gte: periodoInicio } }
      ]
    }
  });
  
  if (repactacion) {
    // Use UTC dates to avoid timezone issues
    const repStartYear = repactacion.fecha_inicio.getUTCFullYear();
    const repStartMonth = repactacion.fecha_inicio.getUTCMonth();
    const periodYear = periodoInicio.getUTCFullYear();
    const periodMonth = periodoInicio.getUTCMonth();
    
    const monthsDiff = (periodYear - repStartYear) * 12 + (periodMonth - repStartMonth);
    const installmentNumber = monthsDiff + 1;
    
    if (installmentNumber > 0 && installmentNumber <= repactacion.total_cuotas) {
      montoRepactacion = installmentNumber === 1 
        ? new Decimal(repactacion.monto_cuota_inicial)
        : new Decimal(repactacion.monto_cuota_base);
      repactacionId = repactacion.id;
      console.log(`  🔄 Repactación cuota ${installmentNumber}: $${montoRepactacion.toFixed(0)}`);
    }
  }
  
  return { montoRepactacion, repactacionId };
}

export function addCargosToRepactacion(
  montoRepactacion: Decimal,
  montoCargoSinIva: Decimal
): Decimal {
  // Add charges without IVA to repactacion (they work the same way)
  if (montoCargoSinIva.gt(0)) {
    return montoRepactacion.plus(montoCargoSinIva);
  }
  return montoRepactacion;
}