import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';

export interface ReposicionInfo {
  montoReposicionAfectoIva: Decimal;
  montoReposicionSinIva: Decimal;
  corteIds: number[];
}

export interface TarifaReposicion {
  costo_reposicion_1: Decimal | number | null;
  costo_reposicion_2: Decimal | number | null;
}

/**
 * Get the reposicion cost from tarifa based on numero_reposicion.
 * Uses tarifa values as the source of truth, not monto_cobrado.
 */
function getReposicionCostFromTarifa(
  tarifa: TarifaReposicion,
  numeroReposicion: number
): Decimal {
  const cost = numeroReposicion === 2 
    ? tarifa.costo_reposicion_2 
    : tarifa.costo_reposicion_1;
  
  if (cost === null || cost === undefined) {
    console.log(`  ⚠️ Tarifa no tiene costo_reposicion_${numeroReposicion}, usando 0`);
    return new Decimal(0);
  }
  
  return new Decimal(cost.toString());
}

/**
 * Process pending reposiciones (service reconnection charges) for a client.
 * Fetches cortes_servicio records where:
 * - estado = 'repuesto' (service has been restored)
 * - boleta_aplicada_id IS NULL (charge hasn't been applied to a bill yet)
 * - fecha_reposicion <= periodoFin (reposicion happened within billing period)
 * 
 * Uses the tarifa's costo_reposicion_1 or costo_reposicion_2 based on numero_reposicion,
 * NOT the monto_cobrado stored in cortes_servicio (which may be incorrect).
 */
export async function processReposiciones(
  prisma: PrismaClient,
  cliente: { id: bigint },
  periodoFin: Date,
  tarifa: TarifaReposicion
): Promise<ReposicionInfo> {
  let montoReposicionAfectoIva = new Decimal(0);
  let montoReposicionSinIva = new Decimal(0);
  
  // Fetch pending reposiciones (restored service, not yet billed)
  const reposicionesPendientes = await prisma.$queryRaw<any[]>`
    SELECT id, monto_cobrado, afecto_iva, numero_reposicion
    FROM cortes_servicio 
    WHERE cliente_id = ${cliente.id}
      AND estado = 'repuesto'
      AND boleta_aplicada_id IS NULL
      AND fecha_reposicion IS NOT NULL
      AND fecha_reposicion <= ${periodoFin}
  `;
  
  const corteIds: number[] = [];
  
  for (const reposicion of reposicionesPendientes) {
    const numeroReposicion = reposicion.numero_reposicion || 1;
    
    // Get cost from tarifa (source of truth), not from monto_cobrado
    const costoFromTarifa = getReposicionCostFromTarifa(tarifa, numeroReposicion);
    
    if (costoFromTarifa.lte(0)) {
      console.log(`  ⚠️ Reposicion ID ${reposicion.id} - tarifa tiene costo 0 para reposicion #${numeroReposicion}, saltando...`);
      continue;
    }
    
    // Log if there's a mismatch between tarifa and stored monto_cobrado
    if (reposicion.monto_cobrado) {
      const storedMonto = new Decimal(reposicion.monto_cobrado);
      if (!storedMonto.eq(costoFromTarifa)) {
        console.log(`  ⚠️ Reposicion ID ${reposicion.id}: monto_cobrado ($${storedMonto}) difiere de tarifa ($${costoFromTarifa}) - usando tarifa`);
      }
    }
    
    if (reposicion.afecto_iva !== false) {
      // Standard reposicion charges that affect IVA calculation (default is afecto_iva = true)
      montoReposicionAfectoIva = montoReposicionAfectoIva.plus(costoFromTarifa);
      console.log(`  🔧 Aplicando reposición #${numeroReposicion} (afecto IVA) ID ${reposicion.id}: $${costoFromTarifa}`);
    } else {
      // Rare case: reposicion without IVA
      montoReposicionSinIva = montoReposicionSinIva.plus(costoFromTarifa);
      console.log(`  🔧 Aplicando reposición #${numeroReposicion} (sin IVA) ID ${reposicion.id}: $${costoFromTarifa}`);
    }
    corteIds.push(reposicion.id);
  }
  
  return {
    montoReposicionAfectoIva,
    montoReposicionSinIva,
    corteIds
  };
}

/**
 * Process reposiciones from pre-fetched cache data (for batch processing).
 * Uses the tarifa's costo_reposicion_1 or costo_reposicion_2 based on numero_reposicion.
 */
export function processReposicionesFromCache(
  cliente: { id: bigint },
  reposicionesCache: Map<string, any[]>,
  tarifa: TarifaReposicion
): ReposicionInfo {
  let montoReposicionAfectoIva = new Decimal(0);
  let montoReposicionSinIva = new Decimal(0);
  const corteIds: number[] = [];
  
  const clienteReposiciones = reposicionesCache.get(cliente.id.toString()) || [];
  
  for (const reposicion of clienteReposiciones) {
    const numeroReposicion = reposicion.numero_reposicion || 1;
    
    // Get cost from tarifa (source of truth), not from monto_cobrado
    const costoFromTarifa = getReposicionCostFromTarifa(tarifa, numeroReposicion);
    
    if (costoFromTarifa.lte(0)) {
      console.log(`  ⚠️ Reposicion ID ${reposicion.id} - tarifa tiene costo 0 para reposicion #${numeroReposicion}, saltando...`);
      continue;
    }
    
    // Log if there's a mismatch between tarifa and stored monto_cobrado
    if (reposicion.monto_cobrado) {
      const storedMonto = new Decimal(reposicion.monto_cobrado);
      if (!storedMonto.eq(costoFromTarifa)) {
        console.log(`  ⚠️ Reposicion ID ${reposicion.id}: monto_cobrado ($${storedMonto}) difiere de tarifa ($${costoFromTarifa}) - usando tarifa`);
      }
    }
    
    if (reposicion.afecto_iva !== false) {
      // Standard reposicion charges that affect IVA calculation (default is afecto_iva = true)
      montoReposicionAfectoIva = montoReposicionAfectoIva.plus(costoFromTarifa);
      console.log(`  🔧 Aplicando reposición #${numeroReposicion} (afecto IVA) ID ${reposicion.id}: $${costoFromTarifa}`);
    } else {
      // Rare case: reposicion without IVA
      montoReposicionSinIva = montoReposicionSinIva.plus(costoFromTarifa);
      console.log(`  🔧 Aplicando reposición #${numeroReposicion} (sin IVA) ID ${reposicion.id}: $${costoFromTarifa}`);
    }
    corteIds.push(reposicion.id);
  }
  
  return {
    montoReposicionAfectoIva,
    montoReposicionSinIva,
    corteIds
  };
}

