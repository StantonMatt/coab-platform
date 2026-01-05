import { PrismaClient } from '@prisma/client';

interface NotaUpdate {
  nota: any;
  periodoFin: Date;
}

interface MultaUpdate {
  multaIds: number[];
  clienteId: bigint;
}

interface ReposicionUpdate {
  corteIds: number[];
  clienteId: bigint;
}

interface DescuentoUpdate {
  descuentoIds: number[];
  clienteId: bigint;
}

/**
 * Updates all notas de crédito in batch for better performance
 */
export async function batchUpdateNotasCredito(
  prisma: PrismaClient,
  notasToUpdate: NotaUpdate[]
): Promise<number> {
  if (notasToUpdate.length === 0) return 0;
  
  console.log(`\n📝 Actualizando ${notasToUpdate.length} notas de crédito...`);
  
  // Group by periodoFin for batch updates
  const updatesByPeriod = new Map<string, number[]>();
  
  for (const { nota, periodoFin } of notasToUpdate) {
    const key = periodoFin.toISOString();
    if (!updatesByPeriod.has(key)) {
      updatesByPeriod.set(key, []);
    }
    updatesByPeriod.get(key)!.push(nota.id);
  }
  
  // Perform batch updates per period
  let totalUpdated = 0;
  for (const [periodStr, notaIds] of Array.from(updatesByPeriod)) {
    const result = await prisma.notas_de_credito.updateMany({
      where: { id: { in: notaIds } },
      data: {
        aplicado: true,
        fecha_aplicacion: new Date(periodStr)
      }
    });
    totalUpdated += result.count;
  }
  
  console.log(`  ✅ Actualizadas ${totalUpdated} notas de crédito`);
  return totalUpdated;
}

/**
 * Updates all multas in batch for better performance
 */
export async function batchUpdateMultas(
  prisma: PrismaClient,
  multasToUpdate: MultaUpdate[],
  boletasByCliente: Map<string, bigint>
): Promise<number> {
  if (multasToUpdate.length === 0) return 0;
  
  console.log(`\n⚠️ Actualizando multas...`);
  
  // Group multas by boleta ID for batch updates
  const updatesByBoleta = new Map<bigint, number[]>();
  
  for (const update of multasToUpdate) {
    const boletaId = boletasByCliente.get(update.clienteId.toString());
    if (boletaId && update.multaIds.length > 0) {
      if (!updatesByBoleta.has(boletaId)) {
        updatesByBoleta.set(boletaId, []);
      }
      updatesByBoleta.get(boletaId)!.push(...update.multaIds);
    }
  }
  
  // Perform batch updates per boleta
  let totalUpdated = 0;
  for (const [boletaId, multaIds] of Array.from(updatesByBoleta)) {
    await prisma.$executeRaw`
      UPDATE multas 
      SET boleta_aplicada_id = ${boletaId},
          updated_at = NOW()
      WHERE id = ANY(${multaIds}::int[])
    `;
    totalUpdated += multaIds.length;
  }
  
  console.log(`  ✅ Actualizadas ${totalUpdated} multas`);
  return totalUpdated;
}

/**
 * Updates all reposiciones (cortes_servicio) in batch for better performance
 */
export async function batchUpdateReposiciones(
  prisma: PrismaClient,
  reposicionesToUpdate: ReposicionUpdate[],
  boletasByCliente: Map<string, bigint>
): Promise<number> {
  if (reposicionesToUpdate.length === 0) return 0;
  
  console.log(`\n🔧 Actualizando reposiciones...`);
  
  // Group cortes by boleta ID for batch updates
  const updatesByBoleta = new Map<bigint, number[]>();
  
  for (const update of reposicionesToUpdate) {
    const boletaId = boletasByCliente.get(update.clienteId.toString());
    if (boletaId && update.corteIds.length > 0) {
      if (!updatesByBoleta.has(boletaId)) {
        updatesByBoleta.set(boletaId, []);
      }
      updatesByBoleta.get(boletaId)!.push(...update.corteIds);
    }
  }
  
  // Perform batch updates per boleta
  let totalUpdated = 0;
  for (const [boletaId, corteIds] of Array.from(updatesByBoleta)) {
    await prisma.$executeRaw`
      UPDATE cortes_servicio 
      SET boleta_aplicada_id = ${boletaId},
          updated_at = NOW()
      WHERE id = ANY(${corteIds}::int[])
    `;
    totalUpdated += corteIds.length;
  }
  
  console.log(`  ✅ Actualizadas ${totalUpdated} reposiciones`);
  return totalUpdated;
}

/**
 * Updates all descuentos_aplicados in batch to link them to their boletas
 */
export async function batchUpdateDescuentos(
  prisma: PrismaClient,
  descuentosToUpdate: DescuentoUpdate[],
  boletasByCliente: Map<string, bigint>
): Promise<number> {
  if (descuentosToUpdate.length === 0) return 0;
  
  console.log(`\n🎁 Actualizando descuentos aplicados...`);
  
  // Group descuentos by boleta ID for batch updates
  const updatesByBoleta = new Map<bigint, number[]>();
  
  for (const update of descuentosToUpdate) {
    const boletaId = boletasByCliente.get(update.clienteId.toString());
    if (boletaId && update.descuentoIds.length > 0) {
      if (!updatesByBoleta.has(boletaId)) {
        updatesByBoleta.set(boletaId, []);
      }
      updatesByBoleta.get(boletaId)!.push(...update.descuentoIds);
    }
  }
  
  // Perform batch updates per boleta
  let totalUpdated = 0;
  for (const [boletaId, descuentoIds] of Array.from(updatesByBoleta)) {
    await prisma.$executeRaw`
      UPDATE descuentos_aplicados 
      SET boleta_id = ${boletaId}
      WHERE id = ANY(${descuentoIds}::int[])
    `;
    totalUpdated += descuentoIds.length;
  }
  
  console.log(`  ✅ Actualizados ${totalUpdated} descuentos aplicados`);
  return totalUpdated;
}

/**
 * Creates boletas in optimized batches
 */
export async function batchCreateBoletas(
  prisma: PrismaClient,
  boletasToCreate: any[],
  batchSize: number = 100
): Promise<void> {
  if (boletasToCreate.length === 0) return;
  
  console.log(`\n💾 Guardando ${boletasToCreate.length} boletas en la base de datos (modo batch)...`);
  
  for (let i = 0; i < boletasToCreate.length; i += batchSize) {
    const chunk = boletasToCreate.slice(i, i + batchSize);
    await prisma.boletas.createMany({
      data: chunk,
      skipDuplicates: true
    });
    console.log(`  ✅ Creadas ${Math.min(i + batchSize, boletasToCreate.length)}/${boletasToCreate.length} boletas`);
  }
}

/**
 * Gets the mapping of cliente_id to boleta_id for updates
 */
export async function getBoletasMapping(
  prisma: PrismaClient,
  periodoInicio: Date,
  periodoFin: Date
): Promise<Map<string, bigint>> {
  const createdBoletas = await prisma.boletas.findMany({
    where: {
      periodo_desde: periodoInicio,
      periodo_hasta: periodoFin
    },
    select: {
      id: true,
      cliente_id: true
    }
  });
  
  const boletasByCliente = new Map<string, bigint>();
  for (const boleta of createdBoletas) {
    if (boleta.cliente_id) {
      boletasByCliente.set(boleta.cliente_id.toString(), boleta.id);
    }
  }
  
  return boletasByCliente;
}

/**
 * Batch update reading corrections
 */
export async function batchUpdateCorrections(
  prisma: PrismaClient,
  corrections: Map<string, any>
): Promise<number> {
  const toApply = Array.from(corrections.values()).filter(c => c.toApply);
  
  if (toApply.length === 0) return 0;
  
  const correctionIds = toApply.map(c => c.id);
  
  await prisma.$executeRaw`
    UPDATE lectura_correcciones 
    SET fecha_aplicacion = NOW()
    WHERE id = ANY(${correctionIds}::int[])
  `;
  
  return toApply.length;
}

/**
 * Performs all batch updates after boletas are created
 */
export async function performBatchUpdates(
  prisma: PrismaClient,
  config: { periodoInicio: Date; periodoFin: Date },
  updates: {
    boletasToCreate: any[];
    notasToUpdate: NotaUpdate[];
    multasToUpdate: MultaUpdate[];
    reposicionesToUpdate?: ReposicionUpdate[];
    descuentosToUpdate?: DescuentoUpdate[];
    corrections?: Map<string, any>;
  },
  boletaCreateBatchSize: number = 100
): Promise<void> {
  // Create boletas first
  await batchCreateBoletas(prisma, updates.boletasToCreate, boletaCreateBatchSize);
  
  // Get mapping for multas/reposiciones/descuentos updates
  const boletasByCliente = await getBoletasMapping(prisma, config.periodoInicio, config.periodoFin);
  
  // Perform updates in parallel for speed
  const promises: Promise<any>[] = [
    batchUpdateNotasCredito(prisma, updates.notasToUpdate),
    batchUpdateMultas(prisma, updates.multasToUpdate, boletasByCliente)
  ];
  
  if (updates.reposicionesToUpdate) {
    promises.push(batchUpdateReposiciones(prisma, updates.reposicionesToUpdate, boletasByCliente));
  }
  
  if (updates.descuentosToUpdate) {
    promises.push(batchUpdateDescuentos(prisma, updates.descuentosToUpdate, boletasByCliente));
  }
  
  if (updates.corrections) {
    promises.push(batchUpdateCorrections(prisma, updates.corrections));
  }
  
  await Promise.all(promises);
}