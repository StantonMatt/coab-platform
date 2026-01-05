/**
 * Boleta Generation Service
 * 
 * Thin wrapper around the proven boleta generation modules.
 * All calculation logic is delegated to src/lib/boleta-generation/
 */

import { Decimal } from 'decimal.js';
import prisma from '../lib/prisma.js';
import {
  createBoletaConfig,
  validateAndFilterClients,
  shouldProcessClient,
  FolioManager,
  determineStartingFolio,
  batchFetchAll,
  batchFetchReadingCorrections,
  generateMonthlyBoleta,
  performBatchUpdates,
} from '../lib/boleta-generation/index.js';

// Types for the API responses
export interface BoletaPreview {
  clienteId: string;
  numeroCliente: string;
  nombreCliente: string;
  rutCliente: string | null;
  consumoM3: number;
  cargoFijo: number;
  costoAgua: number;
  costoAlcantarillado: number;
  costoTratamiento: number;
  subtotal: number;
  montoDescuento: number;
  montoSubsidio: number;
  montoTotalMes: number;
  saldoAnterior: number;
  montoRepactacion: number;
  montoOtrosCargos: number;
  montoNeto: number;
  montoIva: number;
  montoTotal: number;
  numeroFolio: string;
  tieneDescuento: boolean;
  tieneSubsidio: boolean;
  tieneRepactacion: boolean;
  tieneMultas: boolean;
  observaciones: string;
}

export interface PreviewSummary {
  totalBoletas: number;
  totalMonto: number;
  conDescuento: number;
  conSubsidio: number;
  conRepactacion: number;
  conMultas: number;
  montoTotalDescuentos: number;
  montoTotalSubsidios: number;
}

export interface PreviewResult {
  periodo: string;
  periodoLabel: string;
  boletas: BoletaPreview[];
  summary: PreviewSummary;
  boletasExistentes: number;
  folioInicial: number;
}

export interface ImportResult {
  periodo: string;
  boletasCreadas: number;
  boletasActualizadas: number;
  notasCredito: number;
  multas: number;
  descuentos: number;
  reposiciones: number;
  errores: string[];
}

// Configuration
const STARTING_FOLIO_JANUARY_2024 = 12628;

/**
 * Gets tariff for a period
 */
async function getTarifa(periodoInicio: Date, periodoFin: Date) {
  const tarifa = await prisma.tarifas.findFirst({
    where: {
      fecha_inicio: { lte: periodoFin },
      OR: [{ fecha_fin: null }, { fecha_fin: { gte: periodoInicio } }]
    },
    orderBy: { fecha_inicio: 'desc' }
  });

  if (!tarifa) {
    throw new Error('No se encontró tarifa válida para el período');
  }

  return tarifa;
}

/**
 * Converts boleta data to preview format
 */
function boletaDataToPreview(boletaData: any, cliente: any): BoletaPreview {
  return {
    clienteId: cliente.id.toString(),
    numeroCliente: cliente.numero_cliente,
    nombreCliente: `${cliente.primer_nombre || ''} ${cliente.primer_apellido || ''}`.trim() || 'Sin nombre',
    rutCliente: cliente.rut,
    consumoM3: Number(boletaData.consumo_m3),
    cargoFijo: Number(boletaData.costo_cargo_fijo || 0),
    costoAgua: Number(boletaData.costo_agua || 0),
    costoAlcantarillado: Number(boletaData.costo_alcantarillado || boletaData.costo_alcantarillado_tratamiento || 0),
    costoTratamiento: Number(boletaData.costo_tratamiento || 0),
    subtotal: Number(boletaData.costo_cargo_fijo || 0) + Number(boletaData.costo_agua || 0) + 
              Number(boletaData.costo_alcantarillado || boletaData.costo_alcantarillado_tratamiento || 0) +
              Number(boletaData.costo_tratamiento || 0),
    montoDescuento: Number(boletaData.monto_descuento),
    montoSubsidio: Number(boletaData.monto_subsidio),
    montoTotalMes: Number(boletaData.monto_total_mes),
    saldoAnterior: Number(boletaData.monto_saldo_anterior),
    montoRepactacion: Number(boletaData.monto_repactacion),
    montoOtrosCargos: Number(boletaData.monto_otros_cargos),
    montoNeto: Number(boletaData.monto_neto),
    montoIva: Number(boletaData.monto_iva),
    montoTotal: Number(boletaData.monto_total),
    numeroFolio: boletaData.numero_folio,
    tieneDescuento: Number(boletaData.monto_descuento) > 0,
    tieneSubsidio: Number(boletaData.monto_subsidio) > 0,
    tieneRepactacion: Number(boletaData.monto_repactacion) > 0,
    tieneMultas: Number(boletaData.monto_otros_cargos) > 0,
    observaciones: boletaData.observaciones || ''
  };
}

/**
 * Generate a preview of boletas for a period without saving to database
 * Uses the proven modules from src/lib/boleta-generation/
 */
export async function generateBoletasPreview(periodo: string): Promise<PreviewResult> {
  const config = createBoletaConfig(periodo, STARTING_FOLIO_JANUARY_2024);
  
  // Check for existing boletas
  const boletasExistentes = await prisma.boletas.count({
    where: {
      periodo_desde: config.periodoInicio,
      periodo_hasta: config.periodoFin
    }
  });

  // Get valid clients using the proven validation
  const { validClients: clientes } = await validateAndFilterClients(
    prisma,
    config.periodoInicio,
    config.periodoFin
  );
  
  if (clientes.length === 0) {
    return {
      periodo,
      periodoLabel: `${config.monthName} ${config.year}`,
      boletas: [],
      summary: {
        totalBoletas: 0,
        totalMonto: 0,
        conDescuento: 0,
        conSubsidio: 0,
        conRepactacion: 0,
        conMultas: 0,
        montoTotalDescuentos: 0,
        montoTotalSubsidios: 0
      },
      boletasExistentes,
      folioInicial: 0
    };
  }

  // Get tarifa
  const tarifa = await getTarifa(config.periodoInicio, config.periodoFin);

  // Determine starting folio using the proven logic
  const folioInicial = await determineStartingFolio(
    prisma,
    config,
    periodo,
    STARTING_FOLIO_JANUARY_2024
  );
  
  const folioManager = new FolioManager(folioInicial);

  // Batch fetch all data using the proven batch processor
  const clientIds = clientes.map(c => c.id);
  
  // Get additional IDs for old clients that might use new client's meters
  const oldClientNumbers = clientes
    .filter(c => !c.es_cliente_actual)
    .map(c => c.numero_cliente);
  
  const currentClients = oldClientNumbers.length > 0
    ? await prisma.clientes.findMany({
        where: {
          numero_cliente: { in: oldClientNumbers },
          es_cliente_actual: true
        },
        select: { id: true, numero_cliente: true }
      })
    : [];
  
  const additionalIds = currentClients.map(c => c.id);

  // Fetch all data using the proven batch function
  const batchData = await batchFetchAll(
    prisma,
    clientIds,
    additionalIds,
    config.periodoInicio,
    config.periodoFin,
    periodo
  );

  // Get reading corrections (critical for accurate calculations)
  const allReadingIds: bigint[] = [];
  for (const meters of Array.from(batchData.meters.values())) {
    for (const meter of meters) {
      for (const lectura of meter.lecturas || []) {
        if (lectura.id) allReadingIds.push(lectura.id);
      }
    }
  }
  const corrections = await batchFetchReadingCorrections(prisma, allReadingIds);

  // Process each client using the proven generateMonthlyBoleta function
  const processedNumeros = new Set<string>();
  const boletas: BoletaPreview[] = [];
  
  // For preview mode, we pass null for the batch arrays to avoid database writes
  // but we still use the proper calculation logic
  for (const cliente of clientes) {
    const { shouldProcess, reason } = shouldProcessClient(
      cliente,
      processedNumeros,
      config.periodoInicio,
      config.periodoFin
    );

    if (!shouldProcess) {
      continue;
    }

    const boletaData = await generateMonthlyBoleta(
      prisma,
      cliente,
      config.periodoInicio,
      config.periodoFin,
      folioManager.getNext(),
      tarifa,
      periodo,
      null, // Don't collect boletas (preview mode)
      null, // Don't collect notas
      null, // Don't collect multas
      null, // Don't collect reposiciones
      null, // Don't collect descuentos
      undefined, // debugLog
      false, // verboseLogging off for web context
      {
        meters: batchData.meters,
        subsidies: batchData.subsidies,
        discounts: batchData.discounts,
        saldos: batchData.saldos,
        notas: batchData.notas,
        repactaciones: batchData.repactaciones,
        multas: batchData.multas,
        reposiciones: batchData.reposiciones,
        corrections: corrections
      },
      true // previewOnly - do NOT write to database
    );

    if (boletaData) {
      processedNumeros.add(cliente.numero_cliente);
      boletas.push(boletaDataToPreview(boletaData, cliente));
    }
  }

  // Calculate summary
  const summary: PreviewSummary = {
    totalBoletas: boletas.length,
    totalMonto: boletas.reduce((sum, b) => sum + b.montoTotal, 0),
    conDescuento: boletas.filter(b => b.tieneDescuento).length,
    conSubsidio: boletas.filter(b => b.tieneSubsidio).length,
    conRepactacion: boletas.filter(b => b.tieneRepactacion).length,
    conMultas: boletas.filter(b => b.tieneMultas).length,
    montoTotalDescuentos: boletas.reduce((sum, b) => sum + b.montoDescuento, 0),
    montoTotalSubsidios: boletas.reduce((sum, b) => sum + b.montoSubsidio, 0)
  };

  return {
    periodo,
    periodoLabel: `${config.monthName} ${config.year}`,
    boletas,
    summary,
    boletasExistentes,
    folioInicial
  };
}

/**
 * Import boletas for a period (save to database)
 * Uses the proven modules from src/lib/boleta-generation/
 */
export async function importBoletas(
  periodo: string,
  options: { sobreescribir?: boolean } = {}
): Promise<ImportResult> {
  const config = createBoletaConfig(periodo, STARTING_FOLIO_JANUARY_2024);
  const result: ImportResult = {
    periodo,
    boletasCreadas: 0,
    boletasActualizadas: 0,
    notasCredito: 0,
    multas: 0,
    descuentos: 0,
    reposiciones: 0,
    errores: []
  };

  try {
    // Check for existing boletas
    const existingCount = await prisma.boletas.count({
      where: {
        periodo_desde: config.periodoInicio,
        periodo_hasta: config.periodoFin
      }
    });

    if (existingCount > 0) {
      if (options.sobreescribir) {
        // Delete existing boletas
        await prisma.boletas.deleteMany({
          where: {
            periodo_desde: config.periodoInicio,
            periodo_hasta: config.periodoFin
          }
        });
        result.boletasActualizadas = existingCount;
      } else {
        throw new Error(`Ya existen ${existingCount} boletas para este período. Use sobreescribir=true para reemplazarlas.`);
      }
    }

    // Get valid clients using the proven validation
    const { validClients: clientes } = await validateAndFilterClients(
      prisma,
      config.periodoInicio,
      config.periodoFin
    );
    
    if (clientes.length === 0) {
      return result;
    }

    // Get tarifa
    const tarifa = await getTarifa(config.periodoInicio, config.periodoFin);

    // Determine starting folio
    const folioInicial = await determineStartingFolio(
      prisma,
      config,
      periodo,
      STARTING_FOLIO_JANUARY_2024
    );
    
    const folioManager = new FolioManager(folioInicial);

    // Batch fetch all data
    const clientIds = clientes.map(c => c.id);
    
    // Get additional IDs for old clients
    const oldClientNumbers = clientes
      .filter(c => !c.es_cliente_actual)
      .map(c => c.numero_cliente);
    
    const currentClients = oldClientNumbers.length > 0
      ? await prisma.clientes.findMany({
          where: {
            numero_cliente: { in: oldClientNumbers },
            es_cliente_actual: true
          },
          select: { id: true, numero_cliente: true }
        })
      : [];
    
    const additionalIds = currentClients.map(c => c.id);

    // Fetch all data using the proven batch function
    const batchData = await batchFetchAll(
      prisma,
      clientIds,
      additionalIds,
      config.periodoInicio,
      config.periodoFin,
      periodo
    );

    // Get reading corrections
    const allReadingIds: bigint[] = [];
    for (const meters of Array.from(batchData.meters.values())) {
      for (const meter of meters) {
        for (const lectura of meter.lecturas || []) {
          if (lectura.id) allReadingIds.push(lectura.id);
        }
      }
    }
    const corrections = await batchFetchReadingCorrections(prisma, allReadingIds);

    // Arrays to collect all operations for batch processing
    const allBoletasToCreate: any[] = [];
    const allNotasToUpdate: { nota: any; periodoFin: Date }[] = [];
    const allMultasToUpdate: { multaIds: number[]; clienteId: bigint }[] = [];
    const allReposicionesToUpdate: { corteIds: number[]; clienteId: bigint }[] = [];
    const allDescuentosToUpdate: { descuentoIds: number[]; clienteId: bigint }[] = [];
    const processedNumeros = new Set<string>();

    // Process each client
    for (const cliente of clientes) {
      const { shouldProcess } = shouldProcessClient(
        cliente,
        processedNumeros,
        config.periodoInicio,
        config.periodoFin
      );

      if (!shouldProcess) {
        continue;
      }

      const boletaData = await generateMonthlyBoleta(
        prisma,
        cliente,
        config.periodoInicio,
        config.periodoFin,
        folioManager.getNext(),
        tarifa,
        periodo,
        allBoletasToCreate,
        allNotasToUpdate,
        allMultasToUpdate,
        allReposicionesToUpdate,
        allDescuentosToUpdate,
        undefined, // debugLog
        false, // verboseLogging off for web context
        {
          meters: batchData.meters,
          subsidies: batchData.subsidies,
          discounts: batchData.discounts,
          saldos: batchData.saldos,
          notas: batchData.notas,
          repactaciones: batchData.repactaciones,
          multas: batchData.multas,
          reposiciones: batchData.reposiciones,
          corrections: corrections
        }
      );

      if (boletaData) {
        processedNumeros.add(cliente.numero_cliente);
      }
    }

    // Perform batch updates using the proven batch updater
    if (allBoletasToCreate.length > 0) {
      await performBatchUpdates(
        prisma,
        { periodoInicio: config.periodoInicio, periodoFin: config.periodoFin },
        {
          boletasToCreate: allBoletasToCreate,
          notasToUpdate: allNotasToUpdate,
          multasToUpdate: allMultasToUpdate,
          reposicionesToUpdate: allReposicionesToUpdate,
          descuentosToUpdate: allDescuentosToUpdate,
          corrections: corrections
        },
        100 // batch size
      );
    }

    // Update result counts
    result.boletasCreadas = allBoletasToCreate.length;
    result.notasCredito = allNotasToUpdate.length;
    result.multas = allMultasToUpdate.reduce((sum, m) => sum + m.multaIds.length, 0);
    result.reposiciones = allReposicionesToUpdate.reduce((sum, r) => sum + r.corteIds.length, 0);
    result.descuentos = allDescuentosToUpdate.reduce((sum, d) => sum + d.descuentoIds.length, 0);

  } catch (error) {
    result.errores.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}
