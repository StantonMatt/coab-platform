import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

// ============================================
// CONFIGURATION - CHANGE THIS FOR EACH RUN
// ============================================
const YEAR_MONTH: string = '2025-08'; // Format: YYYY-MM
const OUTPUT_SUFFIX = '-final'; // Add suffix to avoid file locks

// ============================================
// DO NOT MODIFY BELOW THIS LINE
// ============================================

// Month names for display
const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Returns the exact column structure required for the planilla
 */
function getRequiredColumns() {
  return [
    'N#',
    'Recibe Subsidio', 
    'Recibe Factura',
    'Numero Cliente',
    'Nombre',
    'Direccion',
    'Ciudad',
    'Comuna', 
    'RUT',
    'Lectura Anterior',
    'Lectura Actual',
    'Consumo M3',
    'Costo Despacho',
    'Costo Reposicion 1',
    'Costo Reposicion 2',
    'Costo M3 Alcantarillado Tratamiento',
    'Cargo Fijo',
    'Costo Total Agua',
    'Costo Total Alcantarillado Tratamiento',
    'Subtotal',
    'Total Mes',
    'Subsidio',
    'Subsidio Porcentaje',
    'Subsidio M3',
    'Total Subsidiado',
    'Monto Neto',
    'IVA',
    'Repactacion',
    'Cuota Actual',
    'Numero Total Cuotas',
    'Deuda Total',
    'Saldo Anterior',
    'Total Pagar',
    'Tasa IVA',
    'Ruta',
    'Subsidio Max 1',
    'Subsidio Max 2'
  ];
}

/**
 * Fetches all necessary data for planilla generation
 */
async function fetchPlanillaData(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number);
  const periodoInicio = new Date(Date.UTC(year, month - 1, 1));
  const periodoFin = new Date(Date.UTC(year, month, 0)); // Last day of the month
  const monthName = monthNames[month - 1];
  
  console.log(`\n🔄 Fetching data for planilla ${monthName} ${year}...`);
  console.log(`   Period: ${periodoInicio.toISOString().split('T')[0]} to ${periodoFin.toISOString().split('T')[0]}`);
  
  // Fetch ALL current clients with their related data
  const clients = await prisma.clientes.findMany({
    where: {
      es_cliente_actual: true
    },
    include: {
      direcciones: true
    },
    orderBy: {
      numero_cliente: 'asc'
    }
  });
  
  // Fetch subsidio historial for the period
  const subsidioHistorial = await prisma.subsidio_historial.findMany();
  
  // Fetch repactaciones
  const repactaciones = await prisma.repactaciones.findMany();
  
  // Fetch lecturas separately for all clients  
  const lecturas = await prisma.lecturas.findMany({
    where: {
      fecha_lectura: {
        gte: new Date(Date.UTC(year, month - 2, 1)), // Previous month
        lte: periodoFin
      }
    },
    include: {
      medidores: {
        include: {
          direcciones: {
            include: {
              clientes: true
            }
          }
        }
      }
    },
    orderBy: {
      fecha_lectura: 'desc'
    }
  });
  
  console.log(`   Found ${lecturas.length} lecturas total`);
  
  console.log(`   Found ${clients.length} clients total`);
  
  // Debug: Check recibe_factura distribution
  const facturaTrueCount = clients.filter(c => c.recibe_factura === true).length;
  console.log(`   Clients with recibe_factura=true: ${facturaTrueCount}/${clients.length}`);
  
  // Debug: Check subsidio_id=2 count
  const subsidio2Count = subsidioHistorial.filter(s => s.subsidio_id === 2).length;
  console.log(`   Clients with subsidio_id=2: ${subsidio2Count}`);
  
  // Debug will be added after tarifas is fetched
  
  // Fetch additional data
  const tarifas = await prisma.tarifas.findMany({
    take: 1,
    orderBy: {
      id: 'desc'
    }
  });
  
  const subsidios = await prisma.subsidios.findMany();
  
  return {
    clients,
    tarifas: tarifas[0] || null,
    subsidios,
    subsidioHistorial,
    repactaciones,
    lecturas
  };
}

/**
 * Creates Excel file with the exact required columns
 */
async function createExcelPlanilla(yearMonth: string, data: any) {
  console.log('\n📊 Creating Excel planilla...');
  
  // Create workbook
  const workbook = XLSX.utils.book_new();
  const requiredColumns = getRequiredColumns();
  
  // Prepare data array starting with headers
  const excelData: any[][] = [];
  
  // Add header row
  excelData.push(requiredColumns);
  
  // Add client data
  data.clients.forEach((cliente: any, index: number) => {
    const direccion = cliente?.direcciones?.[0];
    
    // Find client's lecturas using the correct relationship chain
    const clientLecturas = data.lecturas.filter((l: any) => 
      l.medidores?.direcciones?.clientes?.numero_cliente === cliente.numero_cliente
    );
    
    // Sort by date
    clientLecturas.sort((a: any, b: any) => new Date(b.fecha_lectura).getTime() - new Date(a.fecha_lectura).getTime());
    
    const lecturaActual = clientLecturas[0];
    const lecturaAnterior = clientLecturas[1];
    
    // Find subsidy info from subsidio_historial
    const subsidioHistorial = data.subsidioHistorial.find((s: any) => 
      s.cliente_id === cliente?.id
    );
    
    // Find active repactacion info
    const repactacion = data.repactaciones.find((r: any) => 
      r.cliente_id === cliente?.id && 
      (r.fecha_termino_real === null || new Date(r.fecha_termino_real) >= new Date('2025-08-01'))
    );
    
    // Pre-calculate values for reuse
    const consumo = (lecturaActual && lecturaAnterior) ? 
      Math.max(0, Number(lecturaActual.valor_lectura) - Number(lecturaAnterior.valor_lectura)) : 0;
    
    // Calculate charges based on new tariff structure
    const cargoFijo = Number(data.tarifas?.cargo_fijo || 0);
    const costoDespacho = Number(data.tarifas?.costo_despacho || 0);
    const costoTotalAgua = consumo * Number(data.tarifas?.costo_m3_agua || 0);
    const costoAlcantarillado = consumo * Number(data.tarifas?.costo_m3_alcantarillado_tratamiento || 0);
    
    // Calculate subsidio if client has one
    let montoSubsidio = 0;
    if (subsidioHistorial) {
      const subsidyType = subsidioHistorial.subsidio_id;
      const waterRate = Number(data.tarifas?.costo_m3_agua || 0);
      const sewageRate = Number(data.tarifas?.costo_m3_alcantarillado_tratamiento || 0);
      
      if (subsidyType === 1 || subsidyType === 2) {
        const threshold = subsidyType === 1 ? 13 : 15;
        const multiplier = subsidyType === 1 ? 1 : 2;
        
        if (consumo > threshold) {
          montoSubsidio = Math.round(((waterRate + sewageRate) * threshold + cargoFijo) / 2 * multiplier);
        } else {
          montoSubsidio = Math.round(((consumo / 2) * (waterRate + sewageRate) + (cargoFijo / 2)) * multiplier);
        }
      }
    }
    
    // Calculate repactacion amount and installment info
    let montoRepactacion = 0;
    let cuotaActual = 0;
    let numeroTotalCuotas = 0;
    let deudaTotal = 0;
    
    if (repactacion) {
      // Calculate which installment this is
      const repStartDate = new Date(repactacion.fecha_inicio);
      const periodDate = new Date('2025-08-01');
      const monthsDiff = (periodDate.getFullYear() - repStartDate.getFullYear()) * 12 + 
                        (periodDate.getMonth() - repStartDate.getMonth());
      const installmentNumber = monthsDiff + 1;
      
      if (installmentNumber > 0 && installmentNumber <= repactacion.total_cuotas) {
        montoRepactacion = installmentNumber === 1 
          ? Number(repactacion.monto_cuota_inicial || repactacion.monto_cuota_base)
          : Number(repactacion.monto_cuota_base);
        cuotaActual = installmentNumber;
        numeroTotalCuotas = Number(repactacion.total_cuotas);
        deudaTotal = Number(repactacion.monto_original);
      }
    }
    
    const subtotal = cargoFijo + costoTotalAgua + costoAlcantarillado;
    const totalMes = subtotal;
    const totalSubsidiado = totalMes - montoSubsidio;
    
    const row: any[] = [];
    
    // Map each required column
    requiredColumns.forEach((column: string) => {
      switch (column) {
        case 'N#':
          row.push(index + 1);
          break;
        case 'Recibe Subsidio':
          row.push(subsidioHistorial ? 1 : '');
          break;
        case 'Recibe Factura':
          row.push(cliente?.recibe_factura === true || cliente?.recibe_factura === 1 ? '1' : '');
          break;
        case 'Numero Cliente':
          row.push(cliente.numero_cliente);
          break;
        case 'Nombre':
          const nombreCompleto = [cliente?.primer_nombre, cliente?.segundo_nombre, cliente?.primer_apellido, cliente?.segundo_apellido]
            .filter(Boolean)
            .join(' ');
          row.push(nombreCompleto || cliente?.nombre_pagante || '');
          break;
        case 'Direccion':
          row.push(direccion?.direccion_calle ? `${direccion.direccion_calle} ${direccion.direccion_numero || ''}`.trim() : '');
          break;
        case 'Ciudad':
          row.push(direccion?.poblacion || '');
          break;
        case 'Comuna':
          row.push(direccion?.comuna || '');
          break;
        case 'RUT':
          row.push(cliente?.rut || '');
          break;
        case 'Lectura Anterior':
          row.push(lecturaAnterior ? Number(lecturaAnterior.valor_lectura) : '');
          break;
        case 'Lectura Actual':
          row.push(lecturaActual ? Number(lecturaActual.valor_lectura) : '');
          break;
        case 'Consumo M3':
          row.push(consumo);
          break;
        case 'Costo Despacho':
          row.push(costoDespacho);
          break;
        case 'Costo Reposicion 1':
          row.push(Number(data.tarifas?.costo_reposicion_1) || 0);
          break;
        case 'Costo Reposicion 2':
          row.push(Number(data.tarifas?.costo_reposicion_2) || 0);
          break;
        case 'Costo M3 Alcantarillado Tratamiento':
          row.push(Number(data.tarifas?.costo_m3_alcantarillado_tratamiento) || 0);
          break;
        case 'Cargo Fijo':
          row.push(Number(data.tarifas?.cargo_fijo) || 0);
          break;
        case 'Costo Total Agua':
          row.push(costoTotalAgua);
          break;
        case 'Costo Total Alcantarillado Tratamiento':
          row.push(costoAlcantarillado);
          break;
        case 'Subtotal':
          row.push(subtotal);
          break;
        case 'Total Mes':
          row.push(subtotal);
          break;
        case 'Subsidio':
          row.push(montoSubsidio);
          break;
        case 'Subsidio Porcentaje':
          row.push(subsidioHistorial?.subsidio_id ? (subsidioHistorial.subsidio_id === 1 ? 50 : 50) : 0);
          break;
        case 'Subsidio M3':
          row.push(subsidioHistorial?.subsidio_id === 1 ? 13 : subsidioHistorial?.subsidio_id === 2 ? 15 : 0);
          break;
        case 'Total Subsidiado':
          row.push(totalSubsidiado);
          break;
        case 'Monto Neto':
          const montoNeto = subtotal * (1 / (1 + 0.19)); // Calculate net amount before IVA
          row.push(Math.round(montoNeto));
          break;
        case 'IVA':
          const iva = subtotal - (subtotal * (1 / (1 + 0.19)));
          row.push(Math.round(iva));
          break;
        case 'Repactacion':
          row.push(montoRepactacion);
          break;
        case 'Cuota Actual':
          row.push(cuotaActual);
          break;
        case 'Numero Total Cuotas':
          row.push(numeroTotalCuotas);
          break;
        case 'Deuda Total':
          row.push(deudaTotal);
          break;
        case 'Saldo Anterior':
          row.push(0); // Would need to calculate from previous periods
          break;
        case 'Total Pagar':
          row.push(subtotal); // Total amount to pay
          break;
        case 'Tasa IVA':
          row.push(0.19); // 19% IVA
          break;
        case 'Ruta':
          row.push(direccion?.ruta_id || '');
          break;
        case 'Subsidio Max 1':
          row.push(subsidioHistorial?.subsidio_id === 1 ? 13 : '');
          break;
        case 'Subsidio Max 2':
          row.push(subsidioHistorial?.subsidio_id === 2 ? 15 : '');
          break;
        default:
          row.push('');
      }
    });
    
    excelData.push(row);
  });
  
  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(excelData);
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Planilla');
  
  // Save file
  const outputDir = path.join(__dirname, '../../../_dev/tables/planillas/generadas');
  const outputPath = path.join(outputDir, `${yearMonth} Planilla Boleta Gen${OUTPUT_SUFFIX}.xlsx`);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  XLSX.writeFile(workbook, outputPath);
  
  console.log(`✅ Planilla saved to: ${outputPath}`);
  console.log(`   ${data.clients.length} clients exported`);
  
  return outputPath;
}

async function main() {
  console.log('='.repeat(60));
  console.log('📊 PLANILLA GENERATOR');
  console.log('='.repeat(60));
  console.log(`📅 Generating planilla for: ${YEAR_MONTH}`);
  console.log('='.repeat(60));
  
  try {
    // Step 1: Fetch data from database
    console.log('\n💾 Step 1: Fetching data from database...');
    const data = await fetchPlanillaData(YEAR_MONTH);
    
    // Step 2: Create Excel file
    // Debug: Check tarifas values
  console.log(`   Tarifas costo_reposicion_1: ${data.tarifas?.costo_reposicion_1}`);
  console.log(`   Tarifas costo_reposicion_2: ${data.tarifas?.costo_reposicion_2}`);

  console.log('\n📄 Step 2: Creating Excel file...');
    const outputPath = await createExcelPlanilla(YEAR_MONTH, data);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ PLANILLA GENERATION COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`📁 File saved at: ${outputPath}`);
    console.log(`📊 Total clients: ${data.clients.length}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error generating planilla:', error);
    process.exit(1);
  }
}

// Run generator
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());