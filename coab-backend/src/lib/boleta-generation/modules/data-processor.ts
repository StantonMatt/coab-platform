import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { MeterReadingInfo } from '../types';
import { calculateSubsidy } from './subsidy-calculator';

/**
 * Processes meter readings using pre-fetched data for performance optimization
 */
export async function processMeterReadingsFromCache(
  prisma: PrismaClient,
  cliente: any,
  periodoInicio: Date,
  periodoFin: Date,
  preFetchedData: {
    meters: Map<string, any[]>;
    corrections: Map<string, any>;
  },
  verboseLogging: boolean = true
): Promise<MeterReadingInfo | null> {
  const clientIdStr = cliente.id.toString();
  const meters = preFetchedData.meters.get(clientIdStr) || [];
  
  // Find meter with readings for this period
  let medidor = meters.find(m => 
    m.lecturas?.some((l: any) => 
      l.fecha_lectura >= periodoInicio && l.fecha_lectura <= periodoFin
    )
  );
  
  // If no meter and this is an old client, look for new client's meter
  if (!medidor && !cliente.es_cliente_actual) {
    if (verboseLogging) {
      console.log(`  🔍 Cliente antiguo sin medidor, buscando medidor del nuevo cliente...`);
    }
    
    const currentClient = await prisma.clientes.findFirst({
      where: {
        numero_cliente: cliente.numero_cliente,
        es_cliente_actual: true
      }
    });
    
    if (currentClient) {
      const currentClientMeters = preFetchedData.meters.get(currentClient.id.toString()) || [];
      medidor = currentClientMeters.find(m => 
        m.lecturas?.some((l: any) => 
          l.fecha_lectura >= periodoInicio && l.fecha_lectura <= periodoFin
        )
      );
      
      if (medidor) {
        if (verboseLogging) {
          console.log(`  ✅ Usando medidor ${medidor.id} del cliente actual (ID: ${currentClient.id})`);
        }
      }
    }
  }
  
  if (!medidor) {
    if (verboseLogging) {
      console.log(`  ⚠️ No se encontró medidor con lecturas para el período`);
    }
    return null;
  }
  
  // Get readings from the meter
  const prevMonth = new Date(periodoInicio);
  prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
  const prevMonthStart = new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth(), 1));
  
  const lecturaActual = medidor.lecturas.find((l: any) => 
    l.fecha_lectura >= periodoInicio && l.fecha_lectura <= periodoFin
  );
  
  const lecturaAnterior = medidor.lecturas.find((l: any) => 
    l.fecha_lectura >= prevMonthStart && l.fecha_lectura < periodoInicio  
  );
  
  if (!lecturaActual) {
    if (verboseLogging) {
      console.log(`  ⚠️ No se encontró lectura para el período`);
    }
    return null;
  }
  
  // Check for corrections
  let valorAnterior = new Decimal(lecturaAnterior?.valor_lectura || (medidor as any).lectura_inicial || 0);
  
  if (!lecturaAnterior && (medidor as any).lectura_inicial) {
    if (verboseLogging) {
      console.log(`  📏 Usando lectura inicial del medidor: ${(medidor as any).lectura_inicial} m³`);
    }
  }
  
  if (lecturaAnterior && preFetchedData.corrections) {
    const correction = preFetchedData.corrections.get(lecturaAnterior.id.toString());
    if (correction) {
      valorAnterior = new Decimal(correction.valor_corregido);
      if (verboseLogging) {
        console.log(`  🔧 Usando lectura CORREGIDA: ${correction.valor_corregido} (original: ${lecturaAnterior.valor_lectura})`);
      }
      // Mark correction for batch update later (don't update individually for performance)
      correction.toApply = true;
    }
  }
  
  const valorActual = new Decimal(lecturaActual.valor_lectura);
  const consumo = valorActual.minus(valorAnterior);
  
  if (verboseLogging) {
    console.log(`  📊 Consumo: ${consumo} m³`);
  }
  
  return { medidor, lecturaAnterior, lecturaActual, valorAnterior, valorActual, consumo };
}

/**
 * Processes discounts using pre-fetched data
 */
export function processDiscountsFromCache(
  cliente: any,
  preFetchedData: Map<string, any[]>,
  verboseLogging: boolean = true
): { montoDescuento: Decimal; descuentoAplicado: any; descuentoIds: number[] } {
  const clientDiscounts = preFetchedData.get(cliente.id.toString()) || [];
  let montoDescuento = new Decimal(0);
  let descuentoAplicado = null;
  const descuentoIds: number[] = [];
  
  for (const descuentoApp of clientDiscounts) {
    if (descuentoApp.descuento) {
      const monto = new Decimal(descuentoApp.monto_aplicado);
      montoDescuento = montoDescuento.plus(monto);
      descuentoAplicado = descuentoApp;
      descuentoIds.push(Number(descuentoApp.id));
      if (verboseLogging) {
        console.log(`  🎁 ${descuentoApp.descuento.nombre}: $${monto.toFixed(0)}`);
      }
    }
  }
  
  return { montoDescuento, descuentoAplicado, descuentoIds };
}

/**
 * Processes subsidies using pre-fetched data
 */
export function processSubsidiesFromCache(
  cliente: any,
  consumo: Decimal,
  tarifa: any,
  periodoInicio: Date,
  preFetchedData: {
    historialByClient: Map<string, any>;
    subsidioMap: Map<number, any>;
  }
): Decimal {
  const historial = preFetchedData.historialByClient.get(cliente.id.toString());
  let montoSubsidio = new Decimal(0);
  
  if (historial && historial.subsidio_id && historial.tipo_cambio !== 'eliminado') {
    const subsidio = preFetchedData.subsidioMap.get(Number(historial.subsidio_id));
    if (subsidio) {
      const porcentaje = Number(subsidio.porcentaje);
      const subsidyType = porcentaje === 50 ? 1 : porcentaje === 100 ? 2 : 0;
      const useNewFormula = periodoInicio >= new Date('2024-04-01');
      
      // Handle both old (separate) and new (combined) tariff structures
      let sewageRate: number;
      let treatmentRate: number;
      
      if (tarifa.costo_m3_alcantarillado_tratamiento !== null && tarifa.costo_m3_alcantarillado_tratamiento !== undefined) {
        // New structure (May 2025+): combined alcantarillado and tratamiento
        sewageRate = Number(tarifa.costo_m3_alcantarillado_tratamiento);
        treatmentRate = 0; // Already included in sewageRate
      } else {
        // Old structure: separate costs
        sewageRate = Number(tarifa.costo_m3_alcantarillado || 0);
        treatmentRate = Number(tarifa.costo_m3_tratamiento || 0);
      }
      
      const subsidyAmount = calculateSubsidy({
        subsidyType,
        consumption: consumo.toNumber(),
        waterRate: Number(tarifa.costo_m3_agua),
        sewageRate: sewageRate,
        treatmentRate: treatmentRate,
        fixedCharge: Number(tarifa.cargo_fijo),
        useNewFormula
      });
      
      montoSubsidio = new Decimal(subsidyAmount);
      console.log(`  💰 Subsidio (${porcentaje}%): $${montoSubsidio.toFixed(0)}`);
    }
  }
  
  return montoSubsidio;
}

/**
 * Processes repactaciones using pre-fetched data
 */
export function processRepactacionFromCache(
  cliente: any,
  periodoInicio: Date,
  preFetchedData: Map<string, any>
): { montoRepactacion: Decimal; repactacionId: bigint | null } {
  const repactacion = preFetchedData.get(cliente.id.toString());
  let montoRepactacion = new Decimal(0);
  let repactacionId: bigint | null = null;
  
  if (repactacion) {
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

/**
 * Processes multas using pre-fetched data
 */
export function processMultasFromCache(
  cliente: any,
  preFetchedData: Map<string, any[]>
): { montoMultaAfectoIva: Decimal; montoCargoSinIva: Decimal; multaIds: number[] } {
  const clientMultas = preFetchedData.get(cliente.id.toString()) || [];
  let montoMultaAfectoIva = new Decimal(0);
  let montoCargoSinIva = new Decimal(0);
  const multaIds: number[] = [];
  
  for (const multa of clientMultas) {
    if (multa.afecto_iva) {
      montoMultaAfectoIva = montoMultaAfectoIva.plus(multa.monto);
      console.log(`  ⚠️ Aplicando multa (afecto IVA) ID ${multa.id}: $${multa.monto}`);
    } else {
      montoCargoSinIva = montoCargoSinIva.plus(multa.monto);
      console.log(`  💰 Aplicando cargo adicional (sin IVA) ID ${multa.id}: $${multa.monto}`);
    }
    multaIds.push(multa.id);
  }
  
  return { montoMultaAfectoIva, montoCargoSinIva, multaIds };
}

/**
 * Processes notas de crédito using pre-fetched data
 */
export function processNotasCreditoFromCache(
  cliente: any,
  preFetchedData: Map<string, any[]>
): { montoNotaCredito: Decimal; notasAplicables: any[] } {
  const clientNotas = preFetchedData.get(cliente.id.toString()) || [];
  let montoNotaCredito = new Decimal(0);
  
  for (const nota of clientNotas) {
    montoNotaCredito = montoNotaCredito.plus(nota.monto);
    console.log(`  📝 Aplicando nota de crédito: $${nota.monto} (dinero ya devuelto que deben repagar)`);
  }
  
  return { montoNotaCredito, notasAplicables: clientNotas };
}