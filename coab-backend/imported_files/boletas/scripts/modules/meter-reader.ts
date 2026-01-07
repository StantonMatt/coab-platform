import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { MeterReadingInfo } from '../types';

export async function getMeterAndReadings(
  prisma: PrismaClient,
  cliente: any,
  periodoInicio: Date,
  periodoFin: Date,
  debugLog?: string[] | null
): Promise<MeterReadingInfo | null> {
  // 1. Get meter - handle client transitions where old clients share meters with new ones
  let medidor = await prisma.medidores.findFirst({
    where: {
      direcciones: {
        cliente_id: cliente.id
      },
      lecturas: {
        some: {
          fecha_lectura: {
            gte: periodoInicio,
            lte: periodoFin
          }
        }
      }
    },
    orderBy: [
      { estado: 'asc' } // Prefer 'activo' over 'averiado' if both have readings
    ]
  });
  
  if (debugLog) {
    debugLog.push(`Medidor search for cliente ID ${cliente.id}: ${medidor ? `Found (ID: ${medidor.id})` : 'Not found with readings'}`);
  }
  
  // If no meter found and this is an old client, look for meter of new client with same numero_cliente
  if (!medidor && !cliente.es_cliente_actual) {
    console.log(`  🔍 Cliente antiguo sin medidor, buscando medidor del nuevo cliente...`);
    
    // Find the current client with the same numero_cliente
    const currentClient = await prisma.clientes.findFirst({
      where: {
        numero_cliente: cliente.numero_cliente,
        es_cliente_actual: true
      }
    });
    
    if (currentClient) {
      // Get the meter from the current client that has readings for this period
      medidor = await prisma.medidores.findFirst({
        where: {
          direcciones: {
            cliente_id: currentClient.id
          },
          lecturas: {
            some: {
              fecha_lectura: {
                gte: periodoInicio,
                lte: periodoFin
              }
            }
          }
        },
        orderBy: [
          { estado: 'asc' }
        ]
      });
      
      if (medidor) {
        console.log(`  ✅ Usando medidor ${medidor.id} del cliente actual (ID: ${currentClient.id})`);
      }
    }
  }
  
  if (!medidor) {
    console.log(`  ⚠️ No se encontró medidor con lecturas para el período`);
    if (debugLog) {
      debugLog.push(`❌ STOPPED: No meter found with readings for period`);
    }
    return null;
  }
  
  // 2. Get readings
  const prevMonth = new Date(periodoInicio);
  prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
  
  const lecturaAnterior = await prisma.lecturas.findFirst({
    where: {
      medidor_id: medidor.id,
      fecha_lectura: {
        gte: new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth(), 1)),
        lt: periodoInicio
      }
    },
    orderBy: { fecha_lectura: 'desc' }
  });
  
  const lecturaActual = await prisma.lecturas.findFirst({
    where: {
      medidor_id: medidor.id,
      fecha_lectura: {
        gte: periodoInicio,
        lte: periodoFin
      }
    },
    orderBy: { fecha_lectura: 'desc' }
  });
  
  if (!lecturaActual) {
    console.log(`  ⚠️ No se encontró lectura para el período`);
    if (debugLog) {
      debugLog.push(`❌ STOPPED: No current period reading found`);
    }
    return null;
  }
  
  // Check for corrections to previous reading
  // If no previous reading exists, use the meter's initial reading (for replaced meters)
  let valorAnterior = new Decimal(lecturaAnterior?.valor_lectura || (medidor as any).lectura_inicial || 0);
  
  if (!lecturaAnterior && (medidor as any).lectura_inicial) {
    console.log(`  📏 Usando lectura inicial del medidor: ${(medidor as any).lectura_inicial} m³`);
  }
  
  if (debugLog) {
    debugLog.push(`Readings: Previous=${valorAnterior}, Current=${lecturaActual.valor_lectura}`);
  }
  
  // First check for corrections in the lectura_correcciones table
  if (lecturaAnterior) {
    const correccion = await prisma.$queryRaw<any[]>`
      SELECT * FROM lectura_correcciones 
      WHERE lectura_original_id = ${lecturaAnterior.id}
      LIMIT 1
    `;
    
    if (correccion.length > 0) {
      const correctedValue = correccion[0].valor_corregido;
      console.log(`  🔧 Usando lectura CORREGIDA: ${correctedValue} (original: ${valorAnterior})`);
      valorAnterior = new Decimal(correctedValue);
      
      // Mark correction as applied if not already
      if (!correccion[0].aplicado) {
        await prisma.$executeRaw`
          UPDATE lectura_correcciones 
          SET aplicado = true, fecha_aplicacion = NOW()
          WHERE id = ${correccion[0].id}
        `;
      }
    }
  }
  
  // Note: Reading corrections are now handled through lectura_correcciones table
  // Notas de crédito now only handle financial credits/refunds
  
  // IMPORTANT: We do NOT correct the current month's reading because:
  // - If we're generating January boleta, the January reading might be wrong but the boleta is being sent as-is
  // - The correction will be applied when generating February's boleta (January becomes the "previous" reading)
  // - This ensures corrections only affect FUTURE boletas, not the current one being generated
  
  let valorActual = new Decimal(lecturaActual.valor_lectura);
  
  // Calculate consumption using potentially corrected PREVIOUS reading and raw CURRENT reading
  const consumo = valorActual.minus(valorAnterior);
  
  console.log(`  📊 Consumo: ${consumo} m³`);
  
  return {
    medidor,
    lecturaAnterior,
    lecturaActual,
    valorAnterior,
    valorActual,
    consumo
  };
}