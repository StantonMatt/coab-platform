import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

// Import all modules
import { createBoletaConfig } from "./modules/config";
import * as batch from "./modules/batch-processor";
import { FolioManager, determineStartingFolio } from "./modules/folio-manager";
import {
  validateAndFilterClients,
  shouldProcessClient,
} from "./modules/client-validator";
import { performBatchUpdates } from "./modules/batch-updater";
import { generateMonthlyBoleta } from "./modules/boleta-generator";

dotenv.config();

const prisma = new PrismaClient();

// ============================================
// CONFIGURATION - CHANGE THIS FOR EACH RUN
// ============================================
const START_YEAR_MONTH: string = "2024-01"; // Start month (inclusive) - Format: YYYY-MM
const END_YEAR_MONTH: string = "2024-01"; // End month (inclusive) - Format: YYYY-MM
const STARTING_FOLIO_JANUARY_2024 = 12628; // Only used for January 2024
const USE_BATCH_OPTIMIZATION = true; // Set to false to use original one-by-one processing
const VERBOSE_LOGGING = false; // Set to true for detailed logging (slower)

// Batch sizes for processing
const CLIENT_BATCH_SIZE = 100; // Number of clients to process in each batch
const BOLETA_CREATE_BATCH_SIZE = 100; // Number of boletas to create in each database batch

// ============================================
// DO NOT MODIFY BELOW THIS LINE
// ============================================

/**
 * Generates a list of year-month strings between start and end dates
 */
function generateMonthRange(
  startYearMonth: string,
  endYearMonth: string
): string[] {
  const [startYear, startMonth] = startYearMonth.split("-").map(Number);
  const [endYear, endMonth] = endYearMonth.split("-").map(Number);

  const months: string[] = [];
  let currentYear = startYear;
  let currentMonth = startMonth;

  while (
    currentYear < endYear ||
    (currentYear === endYear && currentMonth <= endMonth)
  ) {
    const yearMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    months.push(yearMonth);

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return months;
}

async function processMonth(yearMonth: string) {
  const config = createBoletaConfig(yearMonth, STARTING_FOLIO_JANUARY_2024);

  console.log(
    `🚀 Generando boletas para ${config.monthName} ${config.year}...\n`
  );
  console.log(
    `   Período: ${config.periodoInicio.toISOString().split("T")[0]} al ${
      config.periodoFin.toISOString().split("T")[0]
    }\n`
  );

  // Debug tracking for specific clients
  const debugLog: Record<string, string[]> = {};

  // Delete existing boletas for this period
  console.log(
    `🗑️ Eliminando boletas existentes de ${config.monthName} ${config.year}...`
  );
  const deleted = await prisma.boletas.deleteMany({
    where: {
      periodo_desde: config.periodoInicio,
      periodo_hasta: config.periodoFin,
    },
  });
  console.log(`   Eliminadas: ${deleted.count} boletas\n`);

  // Validate and filter clients
  const { validClients: clientes } = await validateAndFilterClients(
    prisma,
    config.periodoInicio,
    config.periodoFin
  );

  // Initialize folio manager
  const startingFolio = await determineStartingFolio(
    prisma,
    config,
    yearMonth,
    STARTING_FOLIO_JANUARY_2024
  );
  const folioManager = new FolioManager(startingFolio);
  console.log(`📄 Folio inicial: ${startingFolio}\n`);

  // Get tariff for this period
  const tarifa = await prisma.tarifas.findFirst({
    where: {
      fecha_inicio: { lte: config.periodoFin },
      OR: [{ fecha_fin: null }, { fecha_fin: { gte: config.periodoInicio } }],
    },
    orderBy: { fecha_inicio: "desc" },
  });

  if (!tarifa) {
    throw new Error("No se encontró tarifa válida para el período");
  }

  // Process in batches
  const processedNumeros = new Set<string>();
  const batchSize = CLIENT_BATCH_SIZE;
  const totalBatches = Math.ceil(clientes.length / batchSize);

  // Arrays to collect all operations for batch processing at the end (if enabled)
  const allBoletasToCreate: any[] = [];
  const allNotasToUpdate: { nota: any; periodoFin: Date }[] = [];
  const allMultasToUpdate: { multaIds: number[]; clienteId: bigint }[] = [];
  const allReposicionesToUpdate: { corteIds: number[]; clienteId: bigint }[] = [];
  let batchCorrectionsData: Map<string, any> = new Map();
  let successCount = 0;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * batchSize;
    const end = Math.min(start + batchSize, clientes.length);
    const batchClients = clientes.slice(start, end);

    console.log(
      `\n📦 Procesando batch ${batchIndex + 1}/${totalBatches} (clientes ${
        start + 1
      }-${end})...\n`
    );

    // PRE-FETCH ALL DATA FOR THIS BATCH
    console.log(`  📥 Pre-cargando datos del batch...`);
    const batchClientIds = batchClients.map((c) => c.id);

    // Batch fetch current client IDs for old clients
    const oldClientNumbers = batchClients
      .filter((c) => !c.es_cliente_actual)
      .map((c) => c.numero_cliente);

    const currentClients =
      oldClientNumbers.length > 0
        ? await prisma.clientes.findMany({
            where: {
              numero_cliente: { in: oldClientNumbers },
              es_cliente_actual: true,
            },
            select: { id: true, numero_cliente: true },
          })
        : [];

    const additionalIds = currentClients.map((c) => c.id);

    // Fetch all data in parallel using the optimized function
    const {
      meters: batchMeterData,
      subsidies: batchSubsidyData,
      discounts: batchDiscountData,
      saldos: batchSaldosData,
      notas: batchNotasData,
      repactaciones: batchRepactacionData,
      multas: batchMultasData,
      reposiciones: batchReposicionesData,
    } = await batch.batchFetchAll(
      prisma,
      batchClientIds,
      additionalIds,
      config.periodoInicio,
      config.periodoFin,
      yearMonth
    );

    // Get all reading corrections for this batch
    const allReadingIds: bigint[] = [];
    for (const meters of Array.from(batchMeterData.values())) {
      for (const meter of meters) {
        for (const lectura of meter.lecturas || []) {
          if (lectura.id) allReadingIds.push(lectura.id);
        }
      }
    }
    const currentBatchCorrections = await batch.batchFetchReadingCorrections(
      prisma,
      allReadingIds
    );

    // Merge corrections into the global map
    for (const [key, value] of Array.from(currentBatchCorrections)) {
      batchCorrectionsData.set(key, value);
    }

    console.log(`  ✅ Datos pre-cargados para ${batchClients.length} clientes`);

    // Process each client with pre-fetched data
    for (const cliente of batchClients) {
      // Check if client should be processed
      const { shouldProcess, reason } = shouldProcessClient(
        cliente,
        processedNumeros,
        config.periodoInicio,
        config.periodoFin
      );

      if (!shouldProcess) {
        console.log(
          `  ⏭️ Saltando ${cliente.numero_cliente} (ID: ${cliente.id}): ${reason}`
        );
        continue;
      }

      const result = await generateMonthlyBoleta(
        prisma,
        cliente,
        config.periodoInicio,
        config.periodoFin,
        folioManager.getNext(),
        tarifa,
        yearMonth,
        USE_BATCH_OPTIMIZATION ? allBoletasToCreate : null,
        USE_BATCH_OPTIMIZATION ? allNotasToUpdate : null,
        USE_BATCH_OPTIMIZATION ? allMultasToUpdate : null,
        USE_BATCH_OPTIMIZATION ? allReposicionesToUpdate : null,
        debugLog,
        VERBOSE_LOGGING,
        // Pass pre-fetched data to avoid repeated queries
        {
          meters: batchMeterData,
          subsidies: batchSubsidyData,
          discounts: batchDiscountData,
          saldos: batchSaldosData,
          notas: batchNotasData,
          repactaciones: batchRepactacionData,
          multas: batchMultasData,
          reposiciones: batchReposicionesData,
          corrections: currentBatchCorrections,
        }
      );

      if (result) {
        processedNumeros.add(cliente.numero_cliente);
        successCount++;
      } else {
        // Folio was already incremented by getNext(), no need to rollback
      }
    }
  }

  // Perform batch operations if enabled
  if (USE_BATCH_OPTIMIZATION && allBoletasToCreate.length > 0) {
    await performBatchUpdates(
      prisma,
      { periodoInicio: config.periodoInicio, periodoFin: config.periodoFin },
      {
        boletasToCreate: allBoletasToCreate,
        notasToUpdate: allNotasToUpdate,
        multasToUpdate: allMultasToUpdate,
        reposicionesToUpdate: allReposicionesToUpdate,
        corrections: batchCorrectionsData,
      },
      BOLETA_CREATE_BATCH_SIZE
    );
  } else if (!USE_BATCH_OPTIMIZATION) {
    console.log(`\n✅ Creadas ${successCount} boletas (modo individual)`);
  }

  // Summary
  const generatedCount = await prisma.boletas.count({
    where: {
      periodo_desde: config.periodoInicio,
      periodo_hasta: config.periodoFin,
    },
  });

  console.log("\n" + "=".repeat(60));
  console.log("=== RESUMEN ===");
  console.log("=".repeat(60));
  console.log(`✅ Boletas generadas: ${generatedCount}`);
  console.log(`📄 Último folio usado: ${folioManager.getLastUsed()}`);

  // Debug summary for specific clients
  if (Object.keys(debugLog).length > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("🔍 DEBUG TRACKING FOR SPECIFIC CLIENTS:");
    console.log("=".repeat(60));

    for (const [cliente, logs] of Object.entries(debugLog)) {
      console.log(`\n📋 Cliente ${cliente}:`);
      if (logs.length === 0) {
        console.log("   No debug information recorded");
      } else {
        logs.forEach((log) => console.log(`   ${log}`));
      }
    }

    console.log("\n" + "=".repeat(60));
  }

  // Check notas de crédito applied
  const notasAplicadas = await prisma.notas_de_credito.count({
    where: {
      aplicado: true,
      fecha_aplicacion: config.periodoFin,
    },
  });
  console.log(`📝 Notas de crédito aplicadas: ${notasAplicadas}`);

  return { generatedCount, lastFolio: folioManager.getLastUsed() };
}

async function main() {
  const monthsToProcess = generateMonthRange(START_YEAR_MONTH, END_YEAR_MONTH);

  console.log("=" + "=".repeat(60));
  console.log("🚀 INICIANDO GENERACIÓN DE BOLETAS PARA MÚLTIPLES MESES");
  console.log("=" + "=".repeat(60));
  console.log(`📅 Período: ${START_YEAR_MONTH} hasta ${END_YEAR_MONTH}`);
  console.log(`📊 Total de meses a procesar: ${monthsToProcess.length}`);
  console.log(`📋 Meses: ${monthsToProcess.join(", ")}`);
  console.log("=" + "=".repeat(60) + "\n");

  const results: {
    month: string;
    generatedCount: number;
    lastFolio: number;
  }[] = [];

  // Process each month sequentially
  for (let i = 0; i < monthsToProcess.length; i++) {
    const yearMonth = monthsToProcess[i];

    console.log("\n" + "=" + "=".repeat(60));
    console.log(
      `📅 PROCESANDO MES ${i + 1} de ${monthsToProcess.length}: ${yearMonth}`
    );
    console.log("=" + "=".repeat(60) + "\n");

    try {
      const result = await processMonth(yearMonth);
      results.push({ month: yearMonth, ...result });

      console.log(`\n✅ Mes ${yearMonth} completado exitosamente\n`);
    } catch (error) {
      console.error(`\n❌ Error procesando mes ${yearMonth}:`, error);
      console.log("\n⚠️ Deteniendo procesamiento debido al error.");
      console.log("   Los meses anteriores ya fueron procesados exitosamente.");
      break;
    }
  }

  // Final summary
  console.log("\n" + "=" + "=".repeat(60));
  console.log("📊 RESUMEN FINAL DE GENERACIÓN");
  console.log("=" + "=".repeat(60));
  console.log(
    `✅ Meses procesados exitosamente: ${results.length} de ${monthsToProcess.length}`
  );

  if (results.length > 0) {
    console.log("\n📋 Detalle por mes:");
    let totalBoletas = 0;
    for (const result of results) {
      console.log(
        `   ${result.month}: ${result.generatedCount} boletas (último folio: ${result.lastFolio})`
      );
      totalBoletas += result.generatedCount;
    }
    console.log(`\n📊 Total de boletas generadas: ${totalBoletas}`);
    console.log(
      `📄 Último folio utilizado: ${results[results.length - 1].lastFolio}`
    );
  }

  if (results.length < monthsToProcess.length) {
    const pendingMonths = monthsToProcess.slice(results.length);
    console.log(`\n⚠️ Meses pendientes: ${pendingMonths.join(", ")}`);
  }

  console.log("=" + "=".repeat(60));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
