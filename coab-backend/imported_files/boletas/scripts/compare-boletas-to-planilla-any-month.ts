import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

// ============================================
// CONFIGURATION - CHANGE THIS FOR EACH RUN
// ============================================
const START_YEAR_MONTH: string = "2024-01"; // Start month (inclusive) - Format: YYYY-MM
const END_YEAR_MONTH: string = "2025-12"; // End month (inclusive) - Format: YYYY-MM

// ============================================
// DO NOT MODIFY BELOW THIS LINE
// ============================================

// Month names for display
const monthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

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

interface PlanillaRow {
  numero: string;
  consumo: number;
  cargoFijo: number;
  agua: number;
  alcantarillado: number;
  tratamiento: number;
  alcantarilladoTratamiento?: number; // Combined field for May 2025+
  subsidio: number;
  descuento: number;
  subtotal: number;
  totalMes: number;
  totalSubsidiado: number;
  saldoAnterior: number;
  repactacion: number;
  neto: number;
  iva: number;
  total: number;
}

function parseExcelValue(value: any): number {
  if (value === null || value === undefined || value === "") return 0;

  // Handle formatted numbers like "9,000.00" or "9.000,00"
  let cleaned = String(value).replace(/[\$]/g, "").trim();

  // Check if it uses comma as thousands separator (9,000.00 format)
  // Handle both positive and negative numbers with commas
  if (cleaned.match(/^-?\d{1,3}(,\d{3})*(\.\d+)?$/)) {
    cleaned = cleaned.replace(/,/g, ""); // Remove thousands separators
  }
  // Check if it uses dot as thousands separator (9.000,00 format)
  else if (cleaned.match(/^-?\d{1,3}(\.\d{3})*(,\d+)?$/)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", "."); // Remove thousands, fix decimal
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

function loadPlanillaData(yearMonth: string): Map<string, PlanillaRow> {
  const PLANILLA_FILENAME = `${yearMonth} Planilla Boleta Gen.xlsx`;
  const PLANILLA_PATH = path.join(
    __dirname,
    "../planillas",
    PLANILLA_FILENAME
  );

  console.log("📂 Loading planilla from:", PLANILLA_PATH);
  console.log(`   Looking for: ${PLANILLA_FILENAME}\n`);

  if (!fs.existsSync(PLANILLA_PATH)) {
    throw new Error(
      `Planilla file not found: ${PLANILLA_PATH}\n   Expected filename: ${PLANILLA_FILENAME}`
    );
  }

  const workbook = XLSX.readFile(PLANILLA_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to array of arrays
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
  }) as any[][];

  console.log(`   Sheet has ${data.length} rows`);

  // Find header row
  let headerRow = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (
      row &&
      row.some((cell) => String(cell).toLowerCase().includes("numero cliente"))
    ) {
      headerRow = i;
      console.log(`   Found header at row ${i}`);
      break;
    }
  }

  if (headerRow === -1) {
    throw new Error('Could not find header row with "Numero Cliente"');
  }

  // Map column indices based on header
  const headers = data[headerRow];
  const columnMap: Record<string, number> = {};

  headers.forEach((header, index) => {
    const h = String(header).toLowerCase().trim();
    if (h.includes("numero cliente")) columnMap.numero = index;
    else if (h === "consumo m3") columnMap.consumo = index;
    else if (h === "cargo fijo") columnMap.cargoFijo = index;
    else if (h === "costo total agua") columnMap.agua = index;
    else if (h === "costo total alcantarillado" && !h.includes("tratamiento"))
      columnMap.alcantarillado = index;
    else if (h === "costo total tratamiento") columnMap.tratamiento = index;
    else if (
      h === "costo total alcantarillado tratamiento" ||
      h === "costo total alcantarillado+tratamiento"
    )
      columnMap.alcantarilladoTratamiento = index;
    else if (
      h === "subsidio" &&
      !h.includes("porcentaje") &&
      !h.includes("max")
    )
      columnMap.subsidio = index;
    else if (h === "descuento") columnMap.descuento = index;
    else if (h === "subtotal") columnMap.subtotal = index;
    else if (h === "total mes") columnMap.totalMes = index;
    else if (h === "total subsidiado") columnMap.totalSubsidiado = index;
    else if (h === "saldo anterior") columnMap.saldoAnterior = index;
    else if (h === "repactacion") columnMap.repactacion = index;
    else if (h === "monto neto") columnMap.neto = index;
    else if (h === "iva") columnMap.iva = index;
    else if (h === "total pagar") columnMap.total = index;
  });

  console.log(
    "📊 Column mapping found:",
    Object.keys(columnMap).length,
    "columns"
  );

  // Sample data for debugging
  if (data.length > headerRow + 1) {
    const sampleRow = data[headerRow + 1];
    console.log(`   Sample client: ${sampleRow[columnMap.numero]}`);
  }

  const planillaData = new Map<string, PlanillaRow>();

  // Process data rows
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[columnMap.numero]) continue;

    const numero = String(row[columnMap.numero]).trim();
    if (!numero || numero === "0") continue;

    const rowData: PlanillaRow = {
      numero,
      consumo: parseExcelValue(row[columnMap.consumo]),
      cargoFijo: parseExcelValue(row[columnMap.cargoFijo]),
      agua: parseExcelValue(row[columnMap.agua]),
      alcantarillado: parseExcelValue(row[columnMap.alcantarillado]),
      tratamiento: parseExcelValue(row[columnMap.tratamiento]),
      alcantarilladoTratamiento:
        columnMap.alcantarilladoTratamiento !== undefined
          ? parseExcelValue(row[columnMap.alcantarilladoTratamiento])
          : undefined,
      subsidio: Math.abs(parseExcelValue(row[columnMap.subsidio])), // Take absolute value for subsidies
      descuento: parseExcelValue(row[columnMap.descuento]),
      subtotal: parseExcelValue(row[columnMap.subtotal]),
      totalMes: parseExcelValue(row[columnMap.totalMes]),
      totalSubsidiado: parseExcelValue(row[columnMap.totalSubsidiado]),
      saldoAnterior: parseExcelValue(row[columnMap.saldoAnterior]),
      repactacion: parseExcelValue(row[columnMap.repactacion]),
      neto: parseExcelValue(row[columnMap.neto]),
      iva: parseExcelValue(row[columnMap.iva]),
      total: parseExcelValue(row[columnMap.total]),
    };

    planillaData.set(numero, rowData);
  }

  console.log(`✅ Loaded ${planillaData.size} rows from planilla\n`);
  return planillaData;
}

async function processMonth(yearMonth: string) {
  const separator = "=".repeat(60);

  // Parse the year and month
  const [year, month] = yearMonth.split("-").map(Number);
  const periodoInicio = new Date(Date.UTC(year, month - 1, 1));
  const periodoFin = new Date(Date.UTC(year, month, 0)); // Last day of the month
  const monthName = monthNames[month - 1];

  console.log(
    `🔄 Comparando boletas con planilla de ${monthName} ${year}...\n`
  );
  console.log(
    `   Período: ${periodoInicio.toISOString().split("T")[0]} al ${
      periodoFin.toISOString().split("T")[0]
    }\n`
  );
  console.log(separator + "\n");

  // Load planilla data
  const planillaData = loadPlanillaData(yearMonth);

  // Load boletas from database
  const boletas = await prisma.boletas.findMany({
    where: {
      periodo_desde: periodoInicio,
      periodo_hasta: periodoFin,
    },
  });

  console.log(`📄 Found ${boletas.length} boletas in database`);
  console.log(`📊 Expected ${planillaData.size} boletas from planilla\n`);

  // Get clients that receive facturas (not boletas)
  const clientesConFactura = await prisma.clientes.findMany({
    where: { recibe_factura: true },
    select: { numero_cliente: true },
  });
  const clientesFacturaSet = new Set(
    clientesConFactura.map((c) => c.numero_cliente)
  );

  // Track which clients have boletas
  const clientesWithBoletas = new Set(boletas.map((b) => b.numero_cliente));

  // Create a map of base numero_cliente -> ANTERIOR boleta for matching
  // This handles cases where old clients have "-ANTERIOR" suffix in DB but planilla uses original number
  const anteriorBoletasMap = new Map<string, typeof boletas[0]>();
  for (const boleta of boletas) {
    if (boleta.numero_cliente.includes('-ANTERIOR')) {
      const baseNumero = boleta.numero_cliente.replace('-ANTERIOR', '');
      anteriorBoletasMap.set(baseNumero, boleta);
    }
  }

  // Find missing boletas (in planilla but not in database, excluding factura clients)
  // Also track which -ANTERIOR boletas are matched to planilla entries
  const missingBoletas: string[] = [];
  const facturaClientes: string[] = [];
  const matchedAnteriorClientes = new Set<string>(); // Track base numbers matched via -ANTERIOR
  
  for (const [numeroCliente, _] of planillaData) {
    if (!clientesWithBoletas.has(numeroCliente)) {
      if (clientesFacturaSet.has(numeroCliente)) {
        facturaClientes.push(numeroCliente);
      } else if (anteriorBoletasMap.has(numeroCliente)) {
        // There's a matching -ANTERIOR boleta - this is a valid match, not missing
        matchedAnteriorClientes.add(numeroCliente);
      } else {
        missingBoletas.push(numeroCliente);
      }
    }
  }

  // Find unexpected boletas (in database but not in planilla)
  // Don't count -ANTERIOR boletas as unexpected if they match a planilla entry
  const unexpectedBoletas: string[] = [];
  for (const boleta of boletas) {
    if (!planillaData.has(boleta.numero_cliente)) {
      // Check if this is an -ANTERIOR boleta that matches a planilla entry
      if (boleta.numero_cliente.includes('-ANTERIOR')) {
        const baseNumero = boleta.numero_cliente.replace('-ANTERIOR', '');
        if (matchedAnteriorClientes.has(baseNumero)) {
          // This -ANTERIOR boleta is matched to a planilla entry, not unexpected
          continue;
        }
      }
      unexpectedBoletas.push(boleta.numero_cliente);
    }
  }

  // Helper function to display client lists
  function displayClientList(
    title: string,
    clients: string[],
    description: string,
    getDetails: (cliente: string) => string
  ) {
    if (clients.length > 0) {
      console.log(`${title} (${clients.length}):`);
      console.log(`   ${description}\n`);
      for (const cliente of clients.slice(0, 10)) {
        console.log(`   - Cliente ${cliente}: ${getDetails(cliente)}`);
      }
      if (clients.length > 10) {
        console.log(`   ... and ${clients.length - 10} more`);
      }
      console.log("\n" + separator + "\n");
    }
  }

  displayClientList(
    "📋 CLIENTS WITH FACTURAS",
    facturaClientes,
    "These clients receive facturas instead of boletas:",
    (cliente) => `Total $${planillaData.get(cliente)?.total || 0}`
  );

  displayClientList(
    "❌ MISSING BOLETAS",
    missingBoletas,
    "These clients are in the planilla but have no boleta in the database:",
    (cliente) => `Expected total $${planillaData.get(cliente)?.total || 0}`
  );

  displayClientList(
    "⚠️ UNEXPECTED BOLETAS",
    unexpectedBoletas,
    "These clients have boletas in the database but are NOT in the planilla:",
    (cliente) =>
      `Total in DB $${
        boletas.find((b) => b.numero_cliente === cliente)?.monto_total || 0
      }`
  );

  const discrepancies: any[] = [];
  let perfectMatches = 0;
  let withDiscrepancies = 0;
  const fieldDiscrepancyCounts: Record<string, number> = {};

  // Compare each boleta with planilla
  for (const boleta of boletas) {
    // Try to get planilla row directly, or via base numero_cliente for -ANTERIOR boletas
    let planillaRow = planillaData.get(boleta.numero_cliente);
    let displayNumeroCliente = boleta.numero_cliente;
    
    if (!planillaRow && boleta.numero_cliente.includes('-ANTERIOR')) {
      const baseNumero = boleta.numero_cliente.replace('-ANTERIOR', '');
      planillaRow = planillaData.get(baseNumero);
      if (planillaRow) {
        displayNumeroCliente = `${baseNumero} (via ${boleta.numero_cliente})`;
      }
    }

    if (!planillaRow) {
      // Already reported as unexpected boleta
      continue;
    }

    const differences: Record<
      string,
      { db: number; excel: number; diff: number }
    > = {};

    // Compare fields - dynamically build based on what's available
    const comparisons: {
      dbField: string;
      excelField: Exclude<keyof PlanillaRow, "numero">;
      name: string;
    }[] = [
      { dbField: "consumo_m3", excelField: "consumo", name: "consumo_m3" },
      {
        dbField: "costo_cargo_fijo",
        excelField: "cargoFijo",
        name: "costo_cargo_fijo",
      },
      { dbField: "costo_agua", excelField: "agua", name: "costo_agua" },
    ];

    // Add alcantarillado/tratamiento fields based on what's in the planilla
    if (planillaRow.alcantarilladoTratamiento !== undefined) {
      // New structure (May 2025+)
      comparisons.push({
        dbField: "costo_alcantarillado_tratamiento",
        excelField: "alcantarilladoTratamiento",
        name: "costo_alcantarillado_tratamiento",
      });
    } else {
      // Old structure
      comparisons.push({
        dbField: "costo_alcantarillado",
        excelField: "alcantarillado",
        name: "costo_alcantarillado",
      });
      comparisons.push({
        dbField: "costo_tratamiento",
        excelField: "tratamiento",
        name: "costo_tratamiento",
      });
    }

    // Continue with other fields
    comparisons.push(
      {
        dbField: "monto_subsidio",
        excelField: "subsidio",
        name: "monto_subsidio",
      },
      {
        dbField: "monto_descuento",
        excelField: "descuento",
        name: "monto_descuento",
      },
      {
        dbField: "monto_total_mes",
        excelField: "totalMes",
        name: "monto_total_mes",
      },
      {
        dbField: "monto_total_subsidiado",
        excelField: "totalSubsidiado",
        name: "monto_total_subsidiado",
      },
      {
        dbField: "monto_saldo_anterior",
        excelField: "saldoAnterior",
        name: "monto_saldo_anterior",
      },
      {
        dbField: "monto_repactacion",
        excelField: "repactacion",
        name: "monto_repactacion",
      },
      { dbField: "monto_neto", excelField: "neto", name: "monto_neto" },
      { dbField: "monto_iva", excelField: "iva", name: "monto_iva" },
      { dbField: "monto_total", excelField: "total", name: "monto_total" }
    );

    for (const comp of comparisons) {
      const dbValue = Math.round(Number((boleta as any)[comp.dbField] || 0));
      const excelValue = planillaRow[comp.excelField] ?? 0; // Handle undefined values

      if (dbValue !== excelValue) {
        differences[comp.name] = {
          db: dbValue,
          excel: excelValue,
          diff: dbValue - excelValue,
        };

        // Count field discrepancies
        fieldDiscrepancyCounts[comp.name] =
          (fieldDiscrepancyCounts[comp.name] || 0) + 1;
      }
    }

    if (Object.keys(differences).length > 0) {
      withDiscrepancies++;
      discrepancies.push({
        numero_cliente: displayNumeroCliente,
        differences,
      });

      // Show first few discrepancies in console
      if (withDiscrepancies <= 5) {
        console.log(`❌ Cliente ${displayNumeroCliente}:`);
        for (const [field, diff] of Object.entries(differences)) {
          console.log(
            `   ${field}: DB=${diff.db}, Excel=${diff.excel} (diff=${diff.diff})`
          );
        }
        console.log("");
      }
    } else {
      perfectMatches++;
    }
  }

  // Report matched -ANTERIOR clients for transparency
  if (matchedAnteriorClientes.size > 0) {
    console.log(`📋 MATCHED VIA -ANTERIOR (${matchedAnteriorClientes.size}):`);
    console.log(`   These planilla entries were matched to -ANTERIOR boletas in DB:\n`);
    for (const baseNumero of Array.from(matchedAnteriorClientes).slice(0, 5)) {
      console.log(`   - Cliente ${baseNumero} → ${baseNumero}-ANTERIOR`);
    }
    if (matchedAnteriorClientes.size > 5) {
      console.log(`   ... and ${matchedAnteriorClientes.size - 5} more`);
    }
    console.log("\n" + separator + "\n");
  }

  // Summary
  console.log("\n" + separator);
  console.log(`📊 RESUMEN DE COMPARACIÓN - ${monthName.toUpperCase()} ${year}`);
  console.log(separator);
  console.log(`Registros en planilla: ${planillaData.size}`);
  console.log(`  📋 Clientes con factura: ${facturaClientes.length}`);
  console.log(
    `  📄 Boletas esperadas: ${planillaData.size - facturaClientes.length}`
  );
  console.log("");
  console.log(`Boletas encontradas (DB): ${boletas.length}`);
  console.log(`❌ Boletas faltantes: ${missingBoletas.length}`);
  console.log(`⚠️ Boletas inesperadas: ${unexpectedBoletas.length}`);
  console.log("");

  const totalCompared = boletas.length - unexpectedBoletas.length;
  if (totalCompared > 0) {
    console.log(`Total boletas comparadas: ${totalCompared}`);
    console.log(
      `✅ Coincidencias perfectas: ${perfectMatches} (${(
        (perfectMatches / totalCompared) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `❌ Con discrepancias: ${withDiscrepancies} (${(
        (withDiscrepancies / totalCompared) *
        100
      ).toFixed(1)}%)`
    );
  }

  if (withDiscrepancies > 5) {
    console.log(
      `\n(Mostrando solo las primeras 5 discrepancias de ${withDiscrepancies} total)`
    );
  }

  // Field analysis
  if (Object.keys(fieldDiscrepancyCounts).length > 0) {
    console.log("\n📈 ANÁLISIS DE DISCREPANCIAS:");
    console.log("Campos con más discrepancias:");
    const sortedFields = Object.entries(fieldDiscrepancyCounts).sort(
      (a, b) => b[1] - a[1]
    );

    for (const [field, count] of sortedFields) {
      const percentage = ((count / boletas.length) * 100).toFixed(1);
      console.log(`   ${field}: ${count} casos (${percentage}%)`);
    }
  }

  // Export to CSV
  const csvFilename = `discrepancies-report-${yearMonth}.csv`;
  const csvPath = path.join(__dirname, csvFilename);
  const csvContent = [
    "Cliente,Campo,Valor DB,Valor Excel,Diferencia",
    ...discrepancies.flatMap((d) =>
      Object.entries(d.differences).map(
        ([field, diff]: [string, any]) =>
          `${d.numero_cliente},${field},${diff.db},${diff.excel},${diff.diff}`
      )
    ),
  ].join("\n");

  if (discrepancies.length > 0) {
    fs.writeFileSync(csvPath, csvContent);
    console.log(`\n📁 Reporte de discrepancias exportado a: ${csvFilename}`);
  }

  // Final status
  console.log("\n" + separator);
  let isPerfect = false;
  if (
    missingBoletas.length === 0 &&
    unexpectedBoletas.length === 0 &&
    withDiscrepancies === 0
  ) {
    console.log(
      "✅ PERFECTO: Todas las boletas coinciden exactamente con la planilla"
    );
    isPerfect = true;
  } else {
    console.log(
      "⚠️ Se encontraron diferencias. Revise el reporte para más detalles."
    );
  }
  console.log(separator);

  return {
    month: yearMonth,
    planillaCount: planillaData.size,
    boletasCount: boletas.length,
    facturaClientes: facturaClientes.length,
    missingCount: missingBoletas.length,
    unexpectedCount: unexpectedBoletas.length,
    perfectMatches,
    withDiscrepancies,
    isPerfect,
    csvGenerated: discrepancies.length > 0,
  };
}

async function main() {
  const monthsToProcess = generateMonthRange(START_YEAR_MONTH, END_YEAR_MONTH);

  const separator = "=".repeat(61);
  console.log(separator);
  console.log("🔍 INICIANDO COMPARACIÓN DE BOLETAS PARA MÚLTIPLES MESES");
  console.log(separator);
  console.log(`📅 Período: ${START_YEAR_MONTH} hasta ${END_YEAR_MONTH}`);
  console.log(`📊 Total de meses a comparar: ${monthsToProcess.length}`);
  console.log(`📋 Meses: ${monthsToProcess.join(", ")}`);
  console.log(separator + "\n");

  const results: any[] = [];
  let totalPerfectMonths = 0;
  let totalWithDiscrepancies = 0;

  // Process each month sequentially
  for (let i = 0; i < monthsToProcess.length; i++) {
    const yearMonth = monthsToProcess[i];

    console.log("\n" + separator);
    console.log(
      `📅 COMPARANDO MES ${i + 1} de ${monthsToProcess.length}: ${yearMonth}`
    );
    console.log(separator + "\n");

    try {
      const result = await processMonth(yearMonth);
      results.push(result);

      if (result.isPerfect) {
        totalPerfectMonths++;
      } else {
        totalWithDiscrepancies++;
      }

      console.log(`\n✅ Mes ${yearMonth} comparado exitosamente\n`);
    } catch (error) {
      console.error(`\n❌ Error comparando mes ${yearMonth}:`, error);
      console.log("\n⚠️ Continuando con el siguiente mes...");
      results.push({
        month: yearMonth,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Final summary
  console.log("\n" + separator);
  console.log("📊 RESUMEN FINAL DE COMPARACIÓN");
  console.log(separator);
  console.log(
    `✅ Meses procesados: ${results.filter((r) => !r.error).length} de ${
      monthsToProcess.length
    }`
  );
  console.log(`✅ Meses perfectos: ${totalPerfectMonths}`);
  console.log(`⚠️ Meses con discrepancias: ${totalWithDiscrepancies}`);

  if (results.length > 0) {
    console.log("\n📋 Detalle por mes:");
    for (const result of results) {
      if (result.error) {
        console.log(`   ${result.month}: ❌ Error - ${result.error}`);
      } else {
        const status = result.isPerfect
          ? "✅ PERFECTO"
          : `⚠️ ${result.withDiscrepancies} discrepancias`;
        console.log(
          `   ${result.month}: ${status} (${result.boletasCount} boletas, ${result.planillaCount} en planilla)`
        );
        if (result.csvGenerated) {
          console.log(`      📁 CSV: discrepancies-report-${result.month}.csv`);
        }
      }
    }
  }

  console.log(separator);
}

// Run comparison
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
