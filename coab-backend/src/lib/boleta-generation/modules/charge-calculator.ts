import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { ChargeBreakdown } from '../types';

export async function calculateBaseCharges(
  consumo: Decimal,
  tarifa: any
): Promise<ChargeBreakdown> {
  const cargoFijo = new Decimal(tarifa.cargo_fijo);
  const costoAgua = consumo.times(tarifa.costo_m3_agua);
  
  // Handle both old (separate) and new (combined) tariff structures
  let costoAlcantarillado: Decimal;
  let costoTratamiento: Decimal;
  
  if (tarifa.costo_m3_alcantarillado_tratamiento !== null && tarifa.costo_m3_alcantarillado_tratamiento !== undefined) {
    // New structure (May 2025+): combined alcantarillado and tratamiento as single charge
    const combinedCost = consumo.times(tarifa.costo_m3_alcantarillado_tratamiento);
    // For internal calculation, treat it as alcantarillado (since they're combined)
    costoAlcantarillado = combinedCost;
    costoTratamiento = new Decimal(0);
  } else {
    // Old structure: separate costs
    costoAlcantarillado = consumo.times(tarifa.costo_m3_alcantarillado || 0);
    costoTratamiento = consumo.times(tarifa.costo_m3_tratamiento || 0);
  }
  
  const subtotal = cargoFijo.plus(costoAgua).plus(costoAlcantarillado).plus(costoTratamiento);
  
  return {
    cargoFijo,
    costoAgua,
    costoAlcantarillado,
    costoTratamiento,
    subtotal,
    montoDescuento: new Decimal(0),
    montoSubsidio: new Decimal(0),
    montoTotalMes: subtotal,
    montoTotalSubsidiado: subtotal,
    montoNeto: new Decimal(0),
    montoIva: new Decimal(0)
  };
}

export async function applyDiscounts(
  prisma: PrismaClient,
  cliente: any,
  periodoInicio: Date,
  periodoFin: Date
): Promise<{ montoDescuento: Decimal; descuentoAplicado: any; descuentoIds: number[] }> {
  let montoDescuento = new Decimal(0);
  let descuentoAplicado = null;
  const descuentoIds: number[] = [];
  
  // Look for active discounts for this period
  const descuentosAplicables = await prisma.descuentos_aplicados.findMany({
    where: {
      cliente_id: cliente.id,
      descuento: {
        fecha_inicio: { lte: periodoFin },
        OR: [
          { fecha_fin: null },
          { fecha_fin: { gte: periodoInicio } }
        ],
        activo: true
      }
    },
    include: {
      descuento: true
    }
  });
  
  // Apply the discounts (could be multiple)
  for (const descuentoApp of descuentosAplicables) {
    if (descuentoApp.descuento) {
      const monto = new Decimal(descuentoApp.monto_aplicado);
      montoDescuento = montoDescuento.plus(monto);
      descuentoAplicado = descuentoApp;
      descuentoIds.push(Number(descuentoApp.id));
      console.log(`  🎁 ${descuentoApp.descuento.nombre}: $${monto.toFixed(0)}`);
    }
  }
  
  return { montoDescuento, descuentoAplicado, descuentoIds };
}

export function calculateIVA(
  montoTotalSubsidiado: Decimal,
  tasaIva: Decimal
): { montoNeto: Decimal; montoIva: Decimal } {
  const divisor = new Decimal(1).plus(tasaIva);
  const montoNeto = montoTotalSubsidiado.dividedBy(divisor).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const montoIva = montoTotalSubsidiado.minus(montoNeto).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  
  return { montoNeto, montoIva };
}

export function adjustChargesForFines(
  charges: ChargeBreakdown,
  montoMultaAfectoIva: Decimal,
  tasaIva: Decimal
): ChargeBreakdown {
  if (montoMultaAfectoIva.isZero()) {
    return charges;
  }
  
  // Add fines that affect IVA to total_mes before IVA calc
  // According to Chilean tax law, IVA must be calculated on the full service amount (after discounts but BEFORE subsidies)
  const finalMontoTotalMes = charges.montoTotalMes.plus(montoMultaAfectoIva);
  const finalMontoTotalSubsidiado = charges.montoTotalSubsidiado.plus(montoMultaAfectoIva);
  
  // IMPORTANT: Calculate IVA on montoTotalMes (before subsidy), not on montoTotalSubsidiado
  // Subsidies are third-party payments and don't reduce the taxable base per SII regulations
  const { montoNeto, montoIva } = calculateIVA(finalMontoTotalMes, tasaIva);
  
  return {
    ...charges,
    montoTotalMes: finalMontoTotalMes,
    montoTotalSubsidiado: finalMontoTotalSubsidiado,
    montoNeto,
    montoIva
  };
}