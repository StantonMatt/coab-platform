import * as fs from "fs";
import * as path from "path";
// @ts-ignore
import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

// ============================================================================
// CONFIGURATION SECTION - Modify these variables as needed
// ============================================================================

// Date range for inferring payments (YYYY-MM format)
// These can be overridden by command line arguments
// Note: Specifying 2024-01 will generate payments for January 2024
const DEFAULT_START_MONTH = "2025-12";
const DEFAULT_END_MONTH = "2025-12";

// Path to the directory containing planilla Excel files
const PLANILLAS_DIRECTORY =
  "C:\\Users\\stant\\OneDrive\\Programming\\coab-platform2\\coab-backend\\imported_files\\boletas\\planillas";

// File naming pattern for planillas (will be formatted with month)
const PLANILLA_FILE_PATTERN = "{month} Planilla Boleta Gen.xlsx";

// Output directory for generated CSV files
const OUTPUT_DIRECTORY = path.join(
  process.cwd(),
  "scripts",
  "one-off",
  "output"
);

// Payment configuration
const PAYMENT_DAY_OF_MONTH = 15; // Day of month to assign for inferred payments
const PAYMENT_TYPE = "efectivo_inferido"; // Type of payment in database
const PAYMENT_SOURCE = "planilla_inference"; // Source identifier

// Display settings
const MAX_MISSING_CLIENTES_TO_DISPLAY = 10; // Number of missing cliente warnings to show

// Debug settings
const GENERATE_DEBUG_CSV = false; // Set to false to skip debug CSV generation
const VERBOSE_DEBUG = false; // Set to true to log all skipped payments and edge cases
const PAYMENT_THRESHOLD = 0.01; // Minimum payment amount to consider (helps with floating point issues)

// Import settings
const IMPORT_TO_DATABASE = true; // Set to true to import inferred payments to DB
const GENERATE_CSV = true; // Set to true to also generate CSV file
const DELETE_EXISTING_INFERRED = true; // Delete existing inferred payments for this period before import
const IMPORT_BATCH_SIZE = 100; // Number of payments to insert per database batch

// ============================================================================
// END CONFIGURATION SECTION
// ============================================================================

const prisma = new PrismaClient();

interface Cliente {
  id: number;
  numero_cliente: string;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  primer_nombre: string | null;
  primer_apellido: string | null;
}

interface PlanillaRow {
  Nombre: string;
  "Numero Cliente": string;
  "Saldo Anterior": any;
  "Total Pagar": any;
  [key: string]: any;
}

interface InferredPayment {
  numero_cliente: string;
  cliente_id: number | null;
  monto: number;
  fecha_pago: string;
  tipo_pago: string;
  estado: string;
  numero_transaccion: string;
  nombre_cliente: string;
  source: string;
  metodo_importacion: string;
  observaciones: string;
  procesado: boolean;
  debug_total_pagar_prev: number;
  debug_saldo_anterior_next: number;
  debug_payment_month: string;
}

interface PagoCreateInput {
  numero_cliente: string;
  cliente_id: bigint | null;
  monto: number;
  fecha_pago: Date;
  tipo_pago: string;
  numero_transaccion: string;
  estado: string;
  nombre_cliente: string | null;
  source: string;
  metodo_importacion: string;
  observaciones: string | null;
  procesado: boolean;
}

/**
 * Prepares an inferred payment for database import by transforming it
 * to match the pagos table structure exactly.
 */
function preparePaymentForImport(payment: InferredPayment): PagoCreateInput {
  return {
    numero_cliente: payment.numero_cliente,
    cliente_id: payment.cliente_id ? BigInt(payment.cliente_id) : null,
    monto: payment.monto,
    fecha_pago: new Date(payment.fecha_pago),
    tipo_pago: payment.tipo_pago,
    numero_transaccion: payment.numero_transaccion,
    estado: payment.estado,
    nombre_cliente: payment.nombre_cliente || null,
    source: payment.source,
    metodo_importacion: payment.metodo_importacion,
    observaciones: payment.observaciones || null,
    procesado: payment.procesado,
  };
}

/**
 * Imports payments to database in batches for better performance.
 * Uses createMany with skipDuplicates to handle re-runs gracefully.
 */
async function batchImportPayments(
  payments: PagoCreateInput[],
  batchSize: number = 100
): Promise<{ created: number; skipped: number }> {
  let totalCreated = 0;
  const totalBatches = Math.ceil(payments.length / batchSize);

  console.log(
    `\n💾 Importing ${payments.length} payments in ${totalBatches} batches...`
  );

  for (let i = 0; i < payments.length; i += batchSize) {
    const batchIndex = Math.floor(i / batchSize) + 1;
    const batch = payments.slice(i, i + batchSize);

    const result = await prisma.pagos.createMany({
      data: batch,
      skipDuplicates: true,
    });

    totalCreated += result.count;
    console.log(
      `  📦 Batch ${batchIndex}/${totalBatches}: Created ${result.count}/${batch.length} payments`
    );
  }

  const skipped = payments.length - totalCreated;
  return { created: totalCreated, skipped };
}

/**
 * Deletes existing inferred payments for the given date range.
 * Only deletes payments with the same source identifier.
 */
async function deleteExistingInferredPayments(
  startMonth: string,
  endMonth: string
): Promise<number> {
  // Calculate date range
  const startDate = new Date(`${startMonth}-01`);
  const [endYear, endMonthNum] = endMonth.split("-").map(Number);
  const endDate = new Date(Date.UTC(endYear, endMonthNum, 0)); // Last day of end month

  console.log(
    `\n🗑️ Deleting existing inferred payments from ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}...`
  );

  const deleted = await prisma.pagos.deleteMany({
    where: {
      source: PAYMENT_SOURCE,
      fecha_pago: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  console.log(`   Deleted: ${deleted.count} existing inferred payments`);
  return deleted.count;
}

async function loadPlanilla(month: string): Promise<Map<string, PlanillaRow>> {
  const fileName = PLANILLA_FILE_PATTERN.replace("{month}", month);
  const filePath = path.join(PLANILLAS_DIRECTORY, fileName);

  if (!fs.existsSync(filePath)) {
    console.log(`Planilla file not found: ${fileName}`);
    return new Map();
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json(worksheet) as PlanillaRow[];

  const planillaMap = new Map<string, PlanillaRow>();
  for (const record of records) {
    if (record["Numero Cliente"]) {
      planillaMap.set(String(record["Numero Cliente"]), record);
    }
  }

  return planillaMap;
}

function parseAmount(amount: any): number {
  if (!amount || amount === "" || amount === "-") return 0;
  if (typeof amount === "number") return Math.round(amount * 100) / 100; // Round to 2 decimals

  // Handle potential string formats
  const stringValue = String(amount).trim();
  if (stringValue === "" || stringValue === "-") return 0;

  const cleaned = stringValue.replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);

  if (isNaN(parsed)) {
    if (VERBOSE_DEBUG) {
      console.log(`  ⚠️ Failed to parse amount: "${amount}" -> "${cleaned}"`);
    }
    return 0;
  }

  return Math.round(parsed * 100) / 100; // Round to 2 decimals to avoid floating point issues
}

async function fetchClientes(): Promise<Map<string, Cliente[]>> {
  console.log("Fetching clientes from database...");

  try {
    const data = await prisma.clientes.findMany({
      select: {
        id: true,
        numero_cliente: true,
        fecha_inicio: true,
        fecha_termino: true,
        primer_nombre: true,
        primer_apellido: true,
      },
      orderBy: [{ numero_cliente: "asc" }, { fecha_inicio: "asc" }],
    });

    // Group clientes by numero_cliente
    const clientesMap = new Map<string, Cliente[]>();
    for (const cliente of data || []) {
      if (!cliente.numero_cliente) continue;

      if (!clientesMap.has(cliente.numero_cliente)) {
        clientesMap.set(cliente.numero_cliente, []);
      }

      const clienteData: Cliente = {
        id: Number(cliente.id),
        numero_cliente: cliente.numero_cliente,
        fecha_inicio: cliente.fecha_inicio
          ? cliente.fecha_inicio.toISOString().split("T")[0]
          : null,
        fecha_termino: cliente.fecha_termino
          ? cliente.fecha_termino.toISOString().split("T")[0]
          : null,
        primer_nombre: cliente.primer_nombre,
        primer_apellido: cliente.primer_apellido,
      };

      clientesMap.get(cliente.numero_cliente)!.push(clienteData);
    }

    console.log(
      `Loaded ${data?.length || 0} clientes for ${
        clientesMap.size
      } unique numero_cliente values`
    );
    return clientesMap;
  } catch (error) {
    console.error("Error fetching clientes:", error);
    throw error;
  }
}

function findClienteId(
  clientesMap: Map<string, Cliente[]>,
  numeroCliente: string,
  paymentDate: string
): number | null {
  const paymentDateObj = new Date(paymentDate);
  
  // First, check if there's an -ANTERIOR client that was active on the payment date
  const anteriorNumero = `${numeroCliente}-ANTERIOR`;
  const anteriorClientes = clientesMap.get(anteriorNumero);
  
  if (anteriorClientes && anteriorClientes.length > 0) {
    for (const cliente of anteriorClientes) {
      const fechaInicio = cliente.fecha_inicio
        ? new Date(cliente.fecha_inicio)
        : new Date("1900-01-01");
      const fechaTermino = cliente.fecha_termino
        ? new Date(cliente.fecha_termino)
        : new Date("2099-12-31");

      if (paymentDateObj >= fechaInicio && paymentDateObj <= fechaTermino) {
        return cliente.id;
      }
    }
  }
  
  // Then check the regular numero_cliente
  const clientes = clientesMap.get(numeroCliente);
  if (!clientes || clientes.length === 0) {
    return null;
  }

  // If only one cliente exists for this numero_cliente, check if payment date is valid
  if (clientes.length === 1) {
    const cliente = clientes[0];
    const fechaInicio = cliente.fecha_inicio
      ? new Date(cliente.fecha_inicio)
      : new Date("1900-01-01");
    
    // If payment is before this client started, don't assign to them
    if (paymentDateObj < fechaInicio) {
      return null; // Will trigger missing cliente warning
    }
    return cliente.id;
  }

  // Find the cliente that was active on the payment date
  for (const cliente of clientes) {
    const fechaInicio = cliente.fecha_inicio
      ? new Date(cliente.fecha_inicio)
      : new Date("1900-01-01");
    const fechaTermino = cliente.fecha_termino
      ? new Date(cliente.fecha_termino)
      : new Date("2099-12-31");

    if (paymentDateObj >= fechaInicio && paymentDateObj <= fechaTermino) {
      return cliente.id;
    }
  }

  // If no match found by date, return the most recent active cliente
  const activeCliente = clientes.find((c) => !c.fecha_termino);
  if (activeCliente) {
    return activeCliente.id;
  }

  // Otherwise return the last cliente in the list
  return clientes[clientes.length - 1].id;
}

function generateMonthRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const [startYear, startMonthNum] = startMonth.split("-").map(Number);
  const [endYear, endMonthNum] = endMonth.split("-").map(Number);

  let currentYear = startYear;
  let currentMonth = startMonthNum;

  while (
    currentYear < endYear ||
    (currentYear === endYear && currentMonth <= endMonthNum)
  ) {
    const monthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    months.push(monthStr);

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return months;
}

function getPreviousMonth(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);

  if (monthNum === 1) {
    return `${year - 1}-12`;
  } else {
    return `${year}-${String(monthNum - 1).padStart(2, "0")}`;
  }
}

function parseArguments(): { startMonth: string; endMonth: string } {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Use defaults if no arguments provided
    console.log(
      `Using default date range: ${DEFAULT_START_MONTH} to ${DEFAULT_END_MONTH}`
    );
    return { startMonth: DEFAULT_START_MONTH, endMonth: DEFAULT_END_MONTH };
  }

  if (args.length === 1) {
    // Single month specified - use it for both start and end
    const month = args[0];
    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      console.error("Error: Month must be in YYYY-MM format");
      process.exit(1);
    }
    return { startMonth: month, endMonth: month };
  }

  if (args.length !== 2) {
    console.log(
      "Usage: npx tsx scripts/one-off/infer-payments-from-planillas.ts [<month>] or [<start-month> <end-month>]"
    );
    console.log("Examples:");
    console.log(
      "  Single month: npx tsx scripts/one-off/infer-payments-from-planillas.ts 2024-01"
    );
    console.log(
      "  Range: npx tsx scripts/one-off/infer-payments-from-planillas.ts 2024-01 2024-04"
    );
    console.log(`Default: ${DEFAULT_START_MONTH} to ${DEFAULT_END_MONTH}`);
    process.exit(1);
  }

  const [startMonth, endMonth] = args;

  // Validate format YYYY-MM
  const monthRegex = /^\d{4}-\d{2}$/;
  if (!monthRegex.test(startMonth) || !monthRegex.test(endMonth)) {
    console.error("Error: Months must be in YYYY-MM format");
    process.exit(1);
  }

  // Validate start is before end
  if (startMonth > endMonth) {
    console.error("Error: Start month must be before or equal to end month");
    process.exit(1);
  }

  return { startMonth, endMonth };
}

async function inferPayments() {
  const { startMonth, endMonth } = parseArguments();

  console.log(
    `\n=== Inferring Payments for ${
      startMonth === endMonth ? startMonth : `${startMonth} to ${endMonth}`
    } ===\n`
  );

  const paymentMonths = generateMonthRange(startMonth, endMonth);
  console.log(`Will generate payments for: ${paymentMonths.join(", ")}\n`);

  // Fetch all clientes from database
  const clientesMap = await fetchClientes();

  const inferredPayments: InferredPayment[] = [];
  const missingClientes = new Set<string>();
  const skippedPayments: {
    cliente: string;
    month: string;
    reason: string;
    amount?: number;
  }[] = [];

  for (const paymentMonth of paymentMonths) {
    const previousMonth = getPreviousMonth(paymentMonth);

    const previousPlanilla = await loadPlanilla(previousMonth);
    const currentPlanilla = await loadPlanilla(paymentMonth);

    if (previousPlanilla.size === 0 || currentPlanilla.size === 0) {
      console.log(
        `Skipping ${paymentMonth}: Missing planilla data (need both ${previousMonth} and ${paymentMonth})`
      );
      continue;
    }

    let paymentsFound = 0;
    let totalPaymentAmount = 0;

    for (const [cta, previousRow] of Array.from(previousPlanilla)) {
      const currentRow = currentPlanilla.get(cta);

      if (!currentRow) {
        if (VERBOSE_DEBUG) {
          console.log(
            `  ℹ️ Cliente ${cta} not found in ${paymentMonth} planilla`
          );
        }
        continue;
      }

      const totalPagar = parseAmount(previousRow["Total Pagar"]);
      const currentSaldoAnterior = parseAmount(currentRow["Saldo Anterior"]);

      // Calculate payment amount: difference between what was owed and what is now owed
      // This works for all cases including:
      // - Normal payments (totalPagar > 0, positive payment reduces saldo)
      // - Overpayments (payment exceeds totalPagar, saldo goes negative)
      // - Payments when client has credit (totalPagar <= 0, but they still pay)
      const paymentAmount = totalPagar - currentSaldoAnterior;

      // Only record positive payments above threshold
      if (paymentAmount > PAYMENT_THRESHOLD) {
        paymentsFound++;
        totalPaymentAmount += paymentAmount;

        // Format for pagos table structure
        // Use configured day of the payment month as the estimated payment date
        const paymentDate = `${paymentMonth}-${String(
          PAYMENT_DAY_OF_MONTH
        ).padStart(2, "0")}`;

        // Find the correct cliente_id for this payment
        const clienteId = findClienteId(clientesMap, cta, paymentDate);

        if (!clienteId) {
          missingClientes.add(cta);
        }

        // Determine if this is an overpayment case (totalPagar was <= 0 but they paid anyway)
        const isOverpaymentCase = totalPagar <= 0;
        const observacion = isOverpaymentCase
          ? `Pago inferido (cliente tenía crédito de ${Math.abs(totalPagar)}): ${previousMonth} Total Pagar (${totalPagar}) → ${paymentMonth} Saldo Anterior (${currentSaldoAnterior})`
          : `Pago inferido de diferencia entre ${previousMonth} Total Pagar (${totalPagar}) y ${paymentMonth} Saldo Anterior (${currentSaldoAnterior})`;

        inferredPayments.push({
          // Required fields
          numero_cliente: cta,
          cliente_id: clienteId,
          monto: paymentAmount,
          fecha_pago: paymentDate,
          tipo_pago: PAYMENT_TYPE,
          estado: "completado",

          // Optional fields
          numero_transaccion: `INFERRED_${paymentMonth}_${cta}`,
          nombre_cliente: previousRow["Nombre"],
          source: PAYMENT_SOURCE,
          metodo_importacion: `inferred_from_planillas`,
          observaciones: observacion,
          procesado: false,

          // Fields for debugging (will be excluded from final CSV)
          debug_total_pagar_prev: totalPagar,
          debug_saldo_anterior_next: currentSaldoAnterior,
          debug_payment_month: paymentMonth,
        });

        if (VERBOSE_DEBUG && isOverpaymentCase) {
          console.log(
            `  💰 Detected payment while client had credit: ${cta} paid $${paymentAmount} (had credit of $${Math.abs(totalPagar)})`
          );
        }
      } else if (paymentAmount > 0) {
        // Track near-zero payments that were skipped
        skippedPayments.push({
          cliente: cta,
          month: paymentMonth,
          reason: `Below threshold ($${paymentAmount.toFixed(
            4
          )} < $${PAYMENT_THRESHOLD})`,
          amount: paymentAmount,
        });
        if (VERBOSE_DEBUG) {
          console.log(
            `  ⚠️ Skipped near-zero payment for ${cta}: $${paymentAmount.toFixed(
              4
            )} (below threshold of $${PAYMENT_THRESHOLD})`
          );
        }
      }
    }

    console.log(
      `${paymentMonth}: Found ${paymentsFound} payments totaling $${totalPaymentAmount.toFixed(
        2
      )}`
    );
  }

  // ============================================================================
  // DATABASE IMPORT
  // ============================================================================
  if (IMPORT_TO_DATABASE && inferredPayments.length > 0) {
    // Optionally delete existing inferred payments for this period
    if (DELETE_EXISTING_INFERRED) {
      await deleteExistingInferredPayments(startMonth, endMonth);
    }

    // Prepare payments for database import
    const paymentsToImport = inferredPayments.map(preparePaymentForImport);

    // Batch import to database
    const { created, skipped } = await batchImportPayments(
      paymentsToImport,
      IMPORT_BATCH_SIZE
    );

    console.log(`\n✅ Database import complete:`);
    console.log(`   Created: ${created} payments`);
    if (skipped > 0) {
      console.log(`   Skipped (duplicates): ${skipped} payments`);
    }
  } else if (IMPORT_TO_DATABASE && inferredPayments.length === 0) {
    console.log(`\n⚠️ No payments to import to database`);
  }

  // ============================================================================
  // CSV GENERATION
  // ============================================================================
  if (GENERATE_CSV) {
    const outputPath = path.join(
      OUTPUT_DIRECTORY,
      `inferred-payments-${startMonth}-to-${endMonth}-pagos.csv`
    );

    if (!fs.existsSync(OUTPUT_DIRECTORY)) {
      fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
    }

    // Headers matching pagos table columns (excluding auto-generated fields like id, fecha_creacion, fecha_actualizacion)
    const headers = [
      "numero_cliente",
      "cliente_id",
      "monto",
      "fecha_pago",
      "tipo_pago",
      "numero_transaccion",
      "estado",
      "nombre_cliente",
      "source",
      "metodo_importacion",
      "observaciones",
      "procesado",
    ];

    const csvContent = [
      headers.join(","),
      ...inferredPayments.map((row) =>
        headers
          .map((h) => {
            const value = (row as any)[h];
            if (value === false) return "false";
            if (value === true) return "true";
            if (value === null || value === undefined) return "";
            if (
              typeof value === "string" &&
              (value.includes(",") ||
                value.includes('"') ||
                value.includes("\n"))
            ) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(",")
      ),
    ].join("\n");

    fs.writeFileSync(outputPath, csvContent);
    console.log(
      `\n✅ Saved ${inferredPayments.length} inferred payments to ${outputPath}`
    );

    // Also save a debug CSV with additional information
    if (GENERATE_DEBUG_CSV) {
      const debugPath = path.join(
        OUTPUT_DIRECTORY,
        `inferred-payments-${startMonth}-to-${endMonth}-debug.csv`
      );
      const debugHeaders = [
        ...headers,
        "debug_total_pagar_prev",
        "debug_saldo_anterior_next",
        "debug_payment_month",
      ];

      const debugCsvContent = [
        debugHeaders.join(","),
        ...inferredPayments.map((row) =>
          debugHeaders
            .map((h) => {
              const value = (row as any)[h];
              if (value === false) return "false";
              if (value === true) return "true";
              if (value === null || value === undefined) return "";
              if (
                typeof value === "string" &&
                (value.includes(",") ||
                  value.includes('"') ||
                  value.includes("\n"))
              ) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value;
            })
            .join(",")
        ),
      ].join("\n");

      fs.writeFileSync(debugPath, debugCsvContent);
      console.log(`✅ Saved debug file to ${debugPath}`);
    }
  }

  const summary = inferredPayments.reduce((acc, payment) => {
    const month = payment.debug_payment_month;
    if (!acc[month]) {
      acc[month] = { count: 0, total: 0 };
    }
    acc[month].count++;
    acc[month].total += payment.monto;
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  console.log("\n=== Summary by Payment Month ===");
  let totalPaymentsAllMonths = 0;
  let totalAmountAllMonths = 0;

  for (const month of Object.keys(summary).sort()) {
    const data = summary[month];
    console.log(
      `${month}: ${data.count} payments, Total: $${data.total.toFixed(2)}`
    );
    totalPaymentsAllMonths += data.count;
    totalAmountAllMonths += data.total;
  }

  console.log("\n=== Final Totals ===");
  console.log(`📊 Total Payments Inferred: ${totalPaymentsAllMonths}`);
  console.log(`💰 Total Amount: $${totalAmountAllMonths.toFixed(2)}`);
  if (totalPaymentsAllMonths > 0) {
    console.log(
      `📈 Average Payment: $${(
        totalAmountAllMonths / totalPaymentsAllMonths
      ).toFixed(2)}`
    );
  }

  if (missingClientes.size > 0) {
    console.log(
      `\n⚠️  Warning: ${missingClientes.size} numero_cliente values not found in database:`
    );
    const missing = Array.from(missingClientes).slice(
      0,
      MAX_MISSING_CLIENTES_TO_DISPLAY
    );
    missing.forEach((cta) => console.log(`  - ${cta}`));
    if (missingClientes.size > MAX_MISSING_CLIENTES_TO_DISPLAY) {
      console.log(
        `  ... and ${
          missingClientes.size - MAX_MISSING_CLIENTES_TO_DISPLAY
        } more`
      );
    }
  }

  // Count how many payments have cliente_id
  const withClienteId = inferredPayments.filter((p) => p.cliente_id).length;
  const withoutClienteId = inferredPayments.filter((p) => !p.cliente_id).length;
  console.log(`\n=== Cliente ID Matching ===`);
  console.log(`✅ Payments with cliente_id: ${withClienteId}`);
  console.log(`❌ Payments without cliente_id: ${withoutClienteId}`);

  if (skippedPayments.length > 0) {
    console.log(`\n⚠️ === Skipped Payments ===`);
    console.log(`Total skipped: ${skippedPayments.length}`);
    if (VERBOSE_DEBUG || skippedPayments.length <= 10) {
      skippedPayments.forEach((skip) => {
        console.log(
          `  - Cliente ${skip.cliente} (${skip.month}): ${skip.reason}`
        );
      });
    } else {
      console.log(`  (Set VERBOSE_DEBUG = true to see details)`);
    }
  }
}

inferPayments()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
