import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { MultaInfo } from '../types';

export async function processMultas(
  prisma: PrismaClient,
  cliente: any,
  periodoInicio: Date,
  periodoFin: Date
): Promise<MultaInfo> {
  let montoMultaAfectoIva = new Decimal(0); // Charges that affect IVA (added before IVA calc)
  let montoCargoSinIva = new Decimal(0); // Charges without IVA (like extra repactacion)
  
  const multasPendientes = await prisma.$queryRaw<any[]>`
    SELECT id, monto, motivo, afecto_iva
    FROM multas 
    WHERE cliente_id = ${cliente.id}
      AND fecha_aplicacion <= ${periodoFin}
      AND (periodo_desde IS NULL OR periodo_desde <= ${periodoFin})
      AND (periodo_hasta IS NULL OR periodo_hasta >= ${periodoInicio})
  `;
  
  const multaIds: number[] = [];
  for (const multa of multasPendientes) {
    if (multa.afecto_iva) {
      // Regular fines that affect IVA calculation
      montoMultaAfectoIva = montoMultaAfectoIva.plus(multa.monto);
      console.log(`  ⚠️ Aplicando multa (afecto IVA) ID ${multa.id}: $${multa.monto}`);
    } else {
      // Charges that don't affect IVA (like extra repactacion)
      montoCargoSinIva = montoCargoSinIva.plus(multa.monto);
      console.log(`  💰 Aplicando cargo adicional (sin IVA) ID ${multa.id}: $${multa.monto}`);
    }
    multaIds.push(multa.id);
  }
  
  return {
    montoMultaAfectoIva,
    montoCargoSinIva,
    multaIds
  };
}