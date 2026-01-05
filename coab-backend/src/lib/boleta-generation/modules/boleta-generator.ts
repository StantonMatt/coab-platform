import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { getMeterAndReadings } from './meter-reader';
import { calculateBaseCharges, applyDiscounts, calculateIVA, adjustChargesForFines } from './charge-calculator';
import { getClientSubsidy } from './subsidy-calculator';
import { calculateSaldoAnterior, applyNotasDeCredito } from './credit-manager';
import { processMultas } from './multa-processor';
import { processReposiciones, processReposicionesFromCache } from './reposicion-processor';
import { calculateRepactacion, addCargosToRepactacion } from './repactacion-handler';
import * as dataProcessor from './data-processor';

/**
 * Main function to generate a monthly boleta for a client
 * 
 * @param previewOnly - When true, calculates the boleta but does NOT write to database
 */
export async function generateMonthlyBoleta(
  prisma: PrismaClient,
  cliente: any,
  periodoInicio: Date,
  periodoFin: Date,
  folioNumber: number,
  tarifa: any,
  yearMonth: string,
  boletasToCreate: any[] | null,
  notasToUpdate: any[] | null,
  multasToUpdate: any[] | null,
  reposicionesToUpdate: any[] | null,
  descuentosToUpdate: any[] | null,
  debugLog?: Record<string, string[]>,
  verboseLogging: boolean = true,
  preFetchedData?: {
    meters: Map<string, any[]>;
    subsidies: any;
    discounts: Map<string, any[]>;
    saldos: Map<string, Decimal>;
    notas: Map<string, any[]>;
    repactaciones: Map<string, any>;
    multas: Map<string, any[]>;
    reposiciones: Map<string, any[]>;
    corrections: Map<string, any>;
  },
  previewOnly: boolean = false
) {
  if (verboseLogging) {
    console.log(`\n🔄 Procesando cliente ${cliente.numero_cliente}...`);
  }
  
  try {
    // 1. Get meter and readings
    let meterInfo;
    
    if (preFetchedData) {
      meterInfo = await dataProcessor.processMeterReadingsFromCache(
        prisma, cliente, periodoInicio, periodoFin, 
        { meters: preFetchedData.meters, corrections: preFetchedData.corrections },
        verboseLogging
      );
    } else {
      meterInfo = await getMeterAndReadings(prisma, cliente, periodoInicio, periodoFin, debugLog?.[cliente.numero_cliente]);
    }
    
    if (!meterInfo) {
      return null;
    }
    
    const { consumo } = meterInfo;
    
    // 2. Calculate base charges
    let charges = await calculateBaseCharges(consumo, tarifa);
    
    // 3. Apply discounts
    let montoDescuento, descuentoAplicado;
    let descuentoIds: number[] = [];
    
    if (preFetchedData) {
      const result = dataProcessor.processDiscountsFromCache(cliente, preFetchedData.discounts, verboseLogging);
      montoDescuento = result.montoDescuento;
      descuentoAplicado = result.descuentoAplicado;
      descuentoIds = result.descuentoIds;
    } else {
      const result = await applyDiscounts(prisma, cliente, periodoInicio, periodoFin);
      montoDescuento = result.montoDescuento;
      descuentoAplicado = result.descuentoAplicado;
      descuentoIds = result.descuentoIds;
    }
    
    charges.montoDescuento = montoDescuento;
    
    // 4. Calculate subsidy
    let montoSubsidio;
    
    if (preFetchedData && preFetchedData.subsidies) {
      montoSubsidio = dataProcessor.processSubsidiesFromCache(cliente, consumo, tarifa, periodoInicio, preFetchedData.subsidies);
    } else {
      montoSubsidio = await getClientSubsidy(prisma, cliente, periodoInicio, consumo, tarifa);
    }
    
    charges.montoSubsidio = montoSubsidio;
    
    // 5. Calculate totals before IVA
    charges.montoTotalMes = charges.subtotal.minus(montoDescuento);
    charges.montoTotalSubsidiado = charges.montoTotalMes.minus(montoSubsidio);
    
    // 6. Calculate initial IVA (per Chilean tax law)
    const tasaIva = new Decimal(tarifa.tasa_iva);
    const ivaResult = calculateIVA(charges.montoTotalMes, tasaIva);
    charges.montoNeto = ivaResult.montoNeto;
    charges.montoIva = ivaResult.montoIva;
    
    // 7. Calculate saldo anterior
    let saldoAnteriorBase;
    if (preFetchedData && preFetchedData.saldos) {
      saldoAnteriorBase = preFetchedData.saldos.get(cliente.id.toString()) || new Decimal(0);
      if (verboseLogging && !saldoAnteriorBase.isZero()) {
        const prefix = saldoAnteriorBase.lt(0) ? '  💳 Saldo a favor' : '  📋 Saldo anterior';
        console.log(`${prefix}: $${saldoAnteriorBase.toFixed(0)}`);
      }
    } else {
      saldoAnteriorBase = await calculateSaldoAnterior(prisma, cliente, periodoInicio, periodoFin, yearMonth);
    }
    
    // 8. Apply notas de crédito
    let notaCreditoInfo;
    
    if (preFetchedData) {
      notaCreditoInfo = dataProcessor.processNotasCreditoFromCache(cliente, preFetchedData.notas);
    } else {
      notaCreditoInfo = await applyNotasDeCredito(prisma, cliente, periodoInicio, yearMonth);
    }
    
    const saldoAnterior = saldoAnteriorBase.plus(notaCreditoInfo.montoNotaCredito);
    
    if (verboseLogging && notaCreditoInfo.montoNotaCredito.gt(0)) {
      console.log(`  📊 Saldo anterior ajustado: $${saldoAnterior.toFixed(0)} (aumentado por nota de crédito)`);
    }
    
    // 9. Check for repactación
    let repactacionInfo;
    
    if (preFetchedData) {
      repactacionInfo = dataProcessor.processRepactacionFromCache(cliente, periodoInicio, preFetchedData.repactaciones);
    } else {
      repactacionInfo = await calculateRepactacion(prisma, cliente, periodoInicio, periodoFin);
    }
    
    // 10. Check for multas
    let multaInfo;
    
    if (preFetchedData) {
      multaInfo = dataProcessor.processMultasFromCache(cliente, preFetchedData.multas);
    } else {
      multaInfo = await processMultas(prisma, cliente, periodoInicio, periodoFin);
    }
    
    // 10b. Check for reposiciones (service reconnection charges)
    // Uses tarifa's costo_reposicion_1/2 as the source of truth for pricing
    let reposicionInfo;
    
    if (preFetchedData && preFetchedData.reposiciones) {
      reposicionInfo = processReposicionesFromCache(cliente, preFetchedData.reposiciones, tarifa);
    } else {
      reposicionInfo = await processReposiciones(prisma, cliente, periodoFin, tarifa);
    }
    
    // Combine multa and reposicion charges
    const totalOtrosCargosAfectoIva = multaInfo.montoMultaAfectoIva.plus(reposicionInfo.montoReposicionAfectoIva);
    const totalCargosSinIva = multaInfo.montoCargoSinIva.plus(reposicionInfo.montoReposicionSinIva);
    
    // Add charges without IVA to repactacion
    repactacionInfo.montoRepactacion = addCargosToRepactacion(repactacionInfo.montoRepactacion, totalCargosSinIva);
    
    // 11. Adjust charges for fines/reposiciones that affect IVA
    charges = adjustChargesForFines(charges, totalOtrosCargosAfectoIva, tasaIva);
    
    // 12. Create boleta data
    const boletaData = createBoletaData(
      cliente,
      folioNumber,
      periodoInicio,
      periodoFin,
      consumo,
      charges,
      saldoAnterior,
      repactacionInfo,
      multaInfo,
      reposicionInfo,
      notaCreditoInfo,
      descuentoAplicado,
      tarifa
    );
    
    // If in batch mode, add to arrays; otherwise create immediately
    if (boletasToCreate !== null) {
      // Batch mode
      boletasToCreate.push(boletaData);
      
      if (notasToUpdate !== null) {
        for (const nota of notaCreditoInfo.notasAplicables) {
          notasToUpdate.push({ nota, periodoFin });
        }
      }
      
      if (multasToUpdate !== null && multaInfo.multaIds.length > 0) {
        multasToUpdate.push({ 
          multaIds: multaInfo.multaIds, 
          clienteId: cliente.id
        });
      }
      
      if (reposicionesToUpdate !== null && reposicionInfo.corteIds.length > 0) {
        reposicionesToUpdate.push({
          corteIds: reposicionInfo.corteIds,
          clienteId: cliente.id
        });
      }
      
      if (descuentosToUpdate !== null && descuentoIds.length > 0) {
        descuentosToUpdate.push({
          descuentoIds: descuentoIds,
          clienteId: cliente.id
        });
      }
      
      if (verboseLogging) {
        console.log(`  ✅ Boleta preparada (ID: ${cliente.id}, Folio: ${folioNumber})`);
      }
    } else if (previewOnly) {
      // Preview mode - just return the calculated data, no DB writes
      if (verboseLogging) {
        console.log(`  👁️ Vista previa calculada (Folio: ${folioNumber})`);
      }
    } else {
      // Individual mode - create in DB immediately
      const nuevaBoleta = await prisma.boletas.create({
        data: boletaData
      });
      
      // Update notas de crédito
      if (notaCreditoInfo.notasAplicables.length > 0) {
        await prisma.notas_de_credito.updateMany({
          where: {
            id: { in: notaCreditoInfo.notasAplicables.map((n: any) => n.id) }
          },
          data: {
            aplicado: true,
            fecha_aplicacion: periodoFin
          }
        });
      }
      
      // Update multas
      if (multaInfo.multaIds.length > 0) {
        await prisma.$executeRaw`
          UPDATE multas 
          SET aplicado = true, 
              boleta_aplicada_id = ${nuevaBoleta.id},
              updated_at = NOW()
          WHERE id = ANY(${multaInfo.multaIds}::int[])
        `;
      }
      
      // Update reposiciones (cortes_servicio)
      if (reposicionInfo.corteIds.length > 0) {
        await prisma.$executeRaw`
          UPDATE cortes_servicio 
          SET boleta_aplicada_id = ${nuevaBoleta.id},
              updated_at = NOW()
          WHERE id = ANY(${reposicionInfo.corteIds}::int[])
        `;
      }
      
      // Update descuentos_aplicados
      if (descuentoIds.length > 0) {
        await prisma.$executeRaw`
          UPDATE descuentos_aplicados 
          SET boleta_id = ${nuevaBoleta.id}
          WHERE id = ANY(${descuentoIds}::int[])
        `;
      }
      
      if (verboseLogging) {
        console.log(`  ✅ Boleta creada (ID: ${nuevaBoleta.id})`);
      }
    }
    
    return boletaData;
    
  } catch (error) {
    if (verboseLogging) {
      console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
}

/**
 * Creates the boleta data object
 */
function createBoletaData(
  cliente: any,
  folioNumber: number,
  periodoInicio: Date,
  periodoFin: Date,
  consumo: Decimal,
  charges: any,
  saldoAnterior: Decimal,
  repactacionInfo: any,
  multaInfo: any,
  reposicionInfo: any,
  notaCreditoInfo: any,
  descuentoAplicado: any,
  tarifa: any
) {
  // Determine cost fields based on tariff structure
  const costFields: any = {
    costo_cargo_fijo: charges.cargoFijo.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    costo_agua: charges.costoAgua.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  };
  
  if (tarifa.costo_m3_alcantarillado_tratamiento !== null && tarifa.costo_m3_alcantarillado_tratamiento !== undefined) {
    costFields.costo_alcantarillado_tratamiento = charges.costoAlcantarillado.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    costFields.costo_alcantarillado = null;
    costFields.costo_tratamiento = null;
  } else {
    costFields.costo_alcantarillado = charges.costoAlcantarillado.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    costFields.costo_tratamiento = charges.costoTratamiento.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    costFields.costo_alcantarillado_tratamiento = null;
  }
  
  // Calculate combined otros cargos (multas + reposiciones)
  const totalOtrosCargosAfectoIva = multaInfo.montoMultaAfectoIva.plus(reposicionInfo.montoReposicionAfectoIva);
  
  return {
    cliente_id: cliente.id,
    numero_cliente: cliente.numero_cliente,
    numero_folio: folioNumber.toString(),
    periodo_desde: periodoInicio,
    periodo_hasta: periodoFin,
    fecha_emision: periodoFin,
    fecha_vencimiento: calculateFechaVencimiento(periodoFin),
    estado: 'pendiente',
    monto_subsidio: charges.montoSubsidio.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    monto_interes: new Decimal(0),
    monto_otros_cargos: totalOtrosCargosAfectoIva.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    monto_repactacion: repactacionInfo.montoRepactacion.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    monto_saldo_anterior: saldoAnterior.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    monto_neto: charges.montoNeto.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    monto_iva: charges.montoIva.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    monto_total: calculateFinalTotal(charges, saldoAnterior, repactacionInfo.montoRepactacion).toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    monto_descuento: charges.montoDescuento.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    monto_total_mes: charges.montoTotalMes.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    monto_total_subsidiado: charges.montoTotalSubsidiado.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    consumo_m3: consumo,
    observaciones: buildObservaciones(
      consumo,
      charges.montoDescuento,
      descuentoAplicado,
      notaCreditoInfo.montoNotaCredito,
      multaInfo.montoMultaAfectoIva,
      multaInfo.montoCargoSinIva,
      reposicionInfo.montoReposicionAfectoIva
    ),
    repactacion_id: repactacionInfo.repactacionId,
    ...costFields
  };
}

/**
 * Helper functions
 */
function calculateFechaVencimiento(periodoFin: Date): Date {
  const fechaVencimiento = new Date(periodoFin);
  fechaVencimiento.setDate(fechaVencimiento.getDate() + 20);
  return fechaVencimiento;
}

function calculateFinalTotal(charges: any, saldoAnterior: Decimal, montoRepactacion: Decimal): Decimal {
  return charges.montoNeto
    .plus(charges.montoIva)
    .minus(charges.montoSubsidio)
    .plus(saldoAnterior)
    .plus(montoRepactacion);
}

function buildObservaciones(
  consumo: Decimal,
  montoDescuento: Decimal,
  descuentoAplicado: any,
  montoNotaCredito: Decimal,
  montoMultaAfectoIva: Decimal,
  montoCargoSinIva: Decimal,
  montoReposicion: Decimal
): string {
  let observaciones = `Consumo: ${consumo} m³.`;
  
  if (montoDescuento.gt(0) && descuentoAplicado?.descuento) {
    observaciones += ` Descuento aplicado: $${montoDescuento.toFixed(0)} (${descuentoAplicado.descuento.nombre}).`;
  }
  
  if (montoNotaCredito.gt(0)) {
    observaciones += ` Nota de crédito aplicada: $${montoNotaCredito.toFixed(0)}.`;
  }
  
  if (montoMultaAfectoIva.gt(0)) {
    observaciones += ` Multa aplicada: $${montoMultaAfectoIva.toFixed(0)}.`;
  }
  
  if (montoReposicion.gt(0)) {
    observaciones += ` Reposición de servicio: $${montoReposicion.toFixed(0)}.`;
  }
  
  if (montoCargoSinIva.gt(0)) {
    observaciones += ` Cargo adicional: $${montoCargoSinIva.toFixed(0)}.`;
  }
  
  return observaciones;
}