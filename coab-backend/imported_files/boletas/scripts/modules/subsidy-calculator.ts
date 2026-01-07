import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { SubsidyCalculationParams } from '../types';

export function calculateSubsidy(params: SubsidyCalculationParams): number {
  const { subsidyType, consumption, waterRate, sewageRate, treatmentRate, fixedCharge, useNewFormula } = params;
  
  if (subsidyType === 0) return 0;
  
  // OLD FORMULA (before April 2024):
  // Both 50% and 100% subsidies use the SAME logic but different multipliers
  // The formula is: ((consumption/2) * rates + fixed/2) * multiplier
  // OR if over 15m³: ((rates * 15) + fixed) / 2 * multiplier
  // Where multiplier = 1 for 50% subsidy, 2 for 100% subsidy
  
  if (!useNewFormula) {
    // Old formula implementation
    const multiplier = subsidyType === 1 ? 1 : 2;
    let subsidyAmount: number;
    
    if (consumption > 15) {
      // Over 15m³: ((rates * 15) + fixed) / 2 * multiplier
      subsidyAmount = ((waterRate + sewageRate + treatmentRate) * 15 + fixedCharge) / 2 * multiplier;
    } else {
      // Under 15m³: ((consumption/2) * rates + fixed/2) * multiplier
      subsidyAmount = ((consumption / 2) * (waterRate + sewageRate + treatmentRate) + (fixedCharge / 2)) * multiplier;
    }
    
    return Math.round(subsidyAmount);
  }
  
  // NEW FORMULA (from April 2024):
  // Different thresholds: 13m³ for 50%, 15m³ for 100%
  const threshold = subsidyType === 1 ? 13 : 15;
  const multiplier = subsidyType === 1 ? 1 : 2;
  let subsidyAmount: number;
  
  if (consumption > threshold) {
    // Over threshold: ((rates * threshold) + fixed) / 2 * multiplier
    subsidyAmount = ((waterRate + sewageRate + treatmentRate) * threshold + fixedCharge) / 2 * multiplier;
  } else {
    // Under threshold: ((consumption/2) * rates + fixed/2) * multiplier
    subsidyAmount = ((consumption / 2) * (waterRate + sewageRate + treatmentRate) + (fixedCharge / 2)) * multiplier;
  }
  
  return Math.round(subsidyAmount);
}

export async function getClientSubsidy(
  prisma: PrismaClient,
  cliente: any,
  periodoInicio: Date,
  consumo: Decimal,
  tarifa: any
): Promise<Decimal> {
  let montoSubsidio = new Decimal(0);
  
  const subsidioHistorial = await prisma.subsidio_historial.findFirst({
    where: { 
      cliente_id: cliente.id,
      fecha_cambio: { lte: periodoInicio }
    },
    orderBy: { fecha_cambio: 'desc' },
    select: { subsidio_id: true, tipo_cambio: true }
  });
  
  if (subsidioHistorial && subsidioHistorial.subsidio_id && subsidioHistorial.tipo_cambio !== 'eliminado') {
    const subsidio = await prisma.subsidios.findUnique({
      where: { id: Number(subsidioHistorial.subsidio_id) }
    });
    
    if (subsidio) {
      const porcentaje = Number(subsidio.porcentaje);
      const subsidyType = porcentaje === 50 ? 1 : porcentaje === 100 ? 2 : 0;
      
      // Check if we should use new formula (from April 2024)
      const useNewFormula = periodoInicio >= new Date('2024-04-01');
      
      // Handle both old (separate) and new (combined) tariff structures
      let sewageRate: number;
      let treatmentRate: number;
      
      if (tarifa.costo_m3_alcantarillado_tratamiento !== null && tarifa.costo_m3_alcantarillado_tratamiento !== undefined) {
        // New structure (May 2025+): combined alcantarillado and tratamiento
        // For subsidy calculation, we need to use the full combined rate
        sewageRate = Number(tarifa.costo_m3_alcantarillado_tratamiento);
        treatmentRate = 0; // Already included in sewageRate
      } else {
        // Old structure: separate costs
        sewageRate = Number(tarifa.costo_m3_alcantarillado || 0);
        treatmentRate = Number(tarifa.costo_m3_tratamiento || 0);
      }
      
      const subsidyAmount = calculateSubsidy({
        subsidyType: subsidyType,
        consumption: consumo.toNumber(),
        waterRate: Number(tarifa.costo_m3_agua),
        sewageRate: sewageRate,
        treatmentRate: treatmentRate,
        fixedCharge: Number(tarifa.cargo_fijo),
        useNewFormula: useNewFormula
      });
      
      montoSubsidio = new Decimal(subsidyAmount);
      console.log(`  💰 Subsidio (${porcentaje}%): $${montoSubsidio.toFixed(0)}`);
    }
  }
  
  return montoSubsidio;
}