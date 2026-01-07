import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';

export interface BatchResult<T> {
  clienteId: bigint;
  data: T;
}

/**
 * Fetches all meter readings for a batch of clients in a single query
 */
export async function batchFetchMeterReadings(
  prisma: PrismaClient,
  clientIds: bigint[],
  periodoInicio: Date,
  periodoFin: Date
) {
  // Get previous month for anterior readings
  const prevMonth = new Date(periodoInicio);
  prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
  const prevMonthStart = new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth(), 1));
  
  // Fetch all meters and readings for all clients in batch
  const metersWithReadings = await prisma.medidores.findMany({
    where: {
      direcciones: {
        cliente_id: { in: clientIds }
      }
    },
    include: {
      direcciones: true,
      lecturas: {
        where: {
          OR: [
            // Current period readings
            {
              fecha_lectura: {
                gte: periodoInicio,
                lte: periodoFin
              }
            },
            // Previous period readings
            {
              fecha_lectura: {
                gte: prevMonthStart,
                lt: periodoInicio
              }
            }
          ]
        },
        orderBy: { fecha_lectura: 'desc' }
      }
    },
    orderBy: { estado: 'asc' } // Prefer 'activo' over 'averiado'
  });
  
  // Organize by client ID
  const metersByClient = new Map<string, any[]>();
  for (const meter of metersWithReadings) {
    const clientId = meter.direcciones?.cliente_id?.toString();
    if (clientId) {
      if (!metersByClient.has(clientId)) {
        metersByClient.set(clientId, []);
      }
      metersByClient.get(clientId)!.push(meter);
    }
  }
  
  return metersByClient;
}

/**
 * Batch fetch reading corrections
 */
export async function batchFetchReadingCorrections(
  prisma: PrismaClient,
  readingIds: bigint[]
) {
  if (readingIds.length === 0) return new Map<string, any>();
  
  const corrections = await prisma.$queryRaw<any[]>`
    SELECT * FROM lectura_correcciones 
    WHERE lectura_original_id = ANY(${readingIds}::bigint[])
  `;
  
  // Map by original reading ID
  const correctionMap = new Map<string, any>();
  for (const correction of corrections) {
    correctionMap.set(correction.lectura_original_id.toString(), correction);
  }
  
  return correctionMap;
}

/**
 * Batch fetch subsidies for multiple clients
 */
export async function batchFetchSubsidies(
  prisma: PrismaClient,
  clientIds: bigint[],
  periodoInicio: Date
) {
  const subsidioHistoriales = await prisma.subsidio_historial.findMany({
    where: {
      cliente_id: { in: clientIds },
      fecha_cambio: { lte: periodoInicio }
    },
    orderBy: { fecha_cambio: 'desc' }
  });
  
  // Get unique subsidy IDs
  const subsidyIds = Array.from(new Set(
    subsidioHistoriales
      .filter(sh => sh.subsidio_id && sh.tipo_cambio !== 'eliminado')
      .map(sh => Number(sh.subsidio_id))
  ));
  
  // Fetch all subsidies
  const subsidios = await prisma.subsidios.findMany({
    where: { id: { in: subsidyIds } }
  });
  
  // Create maps for quick lookup
  const subsidioMap = new Map(subsidios.map(s => [s.id, s]));
  const historialByClient = new Map<string, any>();
  
  // Get most recent historial for each client
  for (const hist of subsidioHistoriales) {
    if (hist.cliente_id) {
      const clientId = hist.cliente_id.toString();
      if (!historialByClient.has(clientId)) {
        historialByClient.set(clientId, hist);
      }
    }
  }
  
  return { historialByClient, subsidioMap };
}

/**
 * Batch fetch discounts for multiple clients
 */
export async function batchFetchDiscounts(
  prisma: PrismaClient,
  clientIds: bigint[],
  periodoInicio: Date,
  periodoFin: Date
) {
  const descuentosAplicados = await prisma.descuentos_aplicados.findMany({
    where: {
      cliente_id: { in: clientIds },
      descuentos: {
        fecha_inicio: { lte: periodoFin },
        OR: [
          { fecha_fin: null },
          { fecha_fin: { gte: periodoInicio } }
        ],
        activo: true
      }
    },
    include: {
      descuentos: true
    }
  });
  
  // Group by client
  const discountsByClient = new Map<string, any[]>();
  for (const descuento of descuentosAplicados) {
    if (descuento.cliente_id) {
      const clientId = descuento.cliente_id.toString();
      if (!discountsByClient.has(clientId)) {
        discountsByClient.set(clientId, []);
      }
      discountsByClient.get(clientId)!.push(descuento);
    }
  }
  
  return discountsByClient;
}

/**
 * Batch fetch saldos anteriores for multiple clients
 */
export async function batchFetchSaldosAnteriores(
  prisma: PrismaClient,
  clientIds: bigint[],
  periodoInicio: Date,
  periodoFin: Date,
  yearMonth: string
) {
  const isFirstMonth = yearMonth === '2024-01';
  
  if (isFirstMonth) {
    // Fetch initial saldos
    const saldosIniciales = await prisma.saldos_iniciales.findMany({
      where: { cliente_id: { in: clientIds } }
    });
    
    const saldosByClient = new Map<string, Decimal>();
    for (const saldo of saldosIniciales) {
      if (saldo.cliente_id) {
        saldosByClient.set(saldo.cliente_id.toString(), new Decimal(saldo.monto_saldo));
      }
    }
    return saldosByClient;
  } else {
    // Calculate previous month dates
    const prevMonth = new Date(periodoInicio);
    prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
    const prevMonthStart = new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth(), 1));
    const prevMonthEnd = new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth() + 1, 0));
    
    // Fetch previous month's boletas
    const boletasAnteriores = await prisma.boletas.findMany({
      where: {
        cliente_id: { in: clientIds },
        periodo_desde: prevMonthStart,
        periodo_hasta: prevMonthEnd
      }
    });
    
    // Get payments made during the CURRENT month (for the previous month's bill)
    const pagos = await prisma.pagos.groupBy({
      by: ['cliente_id'],
      where: {
        cliente_id: { in: clientIds },
        fecha_pago: {
          gte: periodoInicio,  // Payments made during current month
          lte: periodoFin      // Up to the end of current month
        },
        estado: 'completado'
      },
      _sum: {
        monto: true
      }
    });
    
    // Create payment map
    const pagosByClient = new Map<string, Decimal>();
    for (const pago of pagos) {
      if (pago.cliente_id) {
        pagosByClient.set(pago.cliente_id.toString(), new Decimal(pago._sum.monto || 0));
      }
    }
    
    // Calculate saldos (one boleta per client for previous month)
    const saldosByClient = new Map<string, Decimal>();
    for (const boleta of boletasAnteriores) {
      if (boleta.cliente_id) {
        const clientId = boleta.cliente_id.toString();
        const montoPagado = pagosByClient.get(clientId) || new Decimal(0);
        // Previous month's total minus payments made during current month
        const saldoPendiente = new Decimal(boleta.monto_total).minus(montoPagado);
        saldosByClient.set(clientId, saldoPendiente);
      }
    }
    
    return saldosByClient;
  }
}

/**
 * Batch fetch notas de credito
 */
export async function batchFetchNotasDeCredito(
  prisma: PrismaClient,
  clientIds: bigint[],
  periodoInicio: Date,
  yearMonth: string
) {
  const isFirstMonth = yearMonth === '2024-01';
  
  if (isFirstMonth) {
    return new Map<string, any[]>();
  }
  
  const notasCredito = await prisma.notas_de_credito.findMany({
    where: {
      cliente_id: { in: clientIds },
      aplicado: false,  // Changed from estado: 'pendiente'
      fecha_emision: { lt: periodoInicio }
    }
  });
  
  // Group by client
  const notasByClient = new Map<string, any[]>();
  for (const nota of notasCredito) {
    if (nota.cliente_id) {
      const clientId = nota.cliente_id.toString();
      if (!notasByClient.has(clientId)) {
        notasByClient.set(clientId, []);
      }
      notasByClient.get(clientId)!.push(nota);
    }
  }
  
  return notasByClient;
}

/**
 * Batch fetch repactaciones
 */
export async function batchFetchRepactaciones(
  prisma: PrismaClient,
  clientIds: bigint[],
  periodoInicio: Date,
  periodoFin: Date
) {
  const repactaciones = await prisma.repactaciones.findMany({
    where: {
      cliente_id: { in: clientIds },
      fecha_inicio: { lte: periodoFin },
      OR: [
        { fecha_termino_real: null },
        { fecha_termino_real: { gte: periodoInicio } }
      ]
    }
  });
  
  // Map by client ID
  const repactacionesByClient = new Map<string, any>();
  for (const repactacion of repactaciones) {
    if (repactacion.cliente_id) {
      repactacionesByClient.set(repactacion.cliente_id.toString(), repactacion);
    }
  }
  
  return repactacionesByClient;
}

/**
 * Batch fetch multas
 */
export async function batchFetchMultas(
  prisma: PrismaClient,
  clientIds: bigint[],
  periodoInicio: Date,
  periodoFin: Date
) {
  const multas = await prisma.$queryRaw<any[]>`
    SELECT id, cliente_id, monto, motivo, afecto_iva
    FROM multas 
    WHERE cliente_id = ANY(${clientIds}::bigint[])
      AND fecha_aplicacion <= ${periodoFin}
      AND (periodo_desde IS NULL OR periodo_desde <= ${periodoFin})
      AND (periodo_hasta IS NULL OR periodo_hasta >= ${periodoInicio})
  `;
  
  // Group by client
  const multasByClient = new Map<string, any[]>();
  for (const multa of multas) {
    if (multa.cliente_id) {
      const clientId = multa.cliente_id.toString();
      if (!multasByClient.has(clientId)) {
        multasByClient.set(clientId, []);
      }
      multasByClient.get(clientId)!.push(multa);
    }
  }
  
  return multasByClient;
}

/**
 * Batch fetch reposiciones (service reconnection charges)
 */
export async function batchFetchReposiciones(
  prisma: PrismaClient,
  clientIds: bigint[],
  periodoFin: Date
) {
  const reposiciones = await prisma.$queryRaw<any[]>`
    SELECT id, cliente_id, monto_cobrado, afecto_iva, numero_reposicion
    FROM cortes_servicio 
    WHERE cliente_id = ANY(${clientIds}::bigint[])
      AND estado = 'repuesto'
      AND boleta_aplicada_id IS NULL
      AND fecha_reposicion IS NOT NULL
      AND fecha_reposicion <= ${periodoFin}
  `;
  
  // Group by client
  const reposicionesByClient = new Map<string, any[]>();
  for (const reposicion of reposiciones) {
    if (reposicion.cliente_id) {
      const clientId = reposicion.cliente_id.toString();
      if (!reposicionesByClient.has(clientId)) {
        reposicionesByClient.set(clientId, []);
      }
      reposicionesByClient.get(clientId)!.push(reposicion);
    }
  }
  
  return reposicionesByClient;
}

/**
 * Fetches all data for a batch of clients in parallel for maximum performance
 */
export async function batchFetchAll(
  prisma: PrismaClient,
  clientIds: bigint[],
  additionalIds: bigint[],
  periodoInicio: Date,
  periodoFin: Date,
  yearMonth: string
) {
  // Fetch all data in parallel for maximum performance
  const allClientIds = [...clientIds, ...additionalIds];
  
  const [meters, subsidies, discounts, saldos, notas, repactaciones, multas, reposiciones] = await Promise.all([
    batchFetchMeterReadings(prisma, allClientIds, periodoInicio, periodoFin),
    batchFetchSubsidies(prisma, clientIds, periodoInicio),
    batchFetchDiscounts(prisma, clientIds, periodoInicio, periodoFin),
    batchFetchSaldosAnteriores(prisma, clientIds, periodoInicio, periodoFin, yearMonth),
    batchFetchNotasDeCredito(prisma, clientIds, periodoInicio, yearMonth),
    batchFetchRepactaciones(prisma, clientIds, periodoInicio, periodoFin),
    batchFetchMultas(prisma, clientIds, periodoInicio, periodoFin),
    batchFetchReposiciones(prisma, clientIds, periodoFin)
  ]);

  return { meters, subsidies, discounts, saldos, notas, repactaciones, multas, reposiciones };
}