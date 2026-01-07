/**
 * One-off script to populate medidor_id for all clients
 * 
 * This script:
 * 1. For clients with existing address/meter chain: derives medidor_id from the chain
 * 2. For ANTERIOR clients: copies medidor_id from the current client with matching base numero_cliente
 * 
 * Run with: npx tsx scripts/populate-medidor-ids.ts
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('🔧 POPULATE MEDIDOR_ID FOR ALL CLIENTS');
  console.log('='.repeat(60));
  console.log('');

  // Step 1: Count clients before
  const totalClientes = await prisma.clientes.count();
  const clientesConMedidor = await prisma.clientes.count({
    where: { medidor_id: { not: null } }
  });
  
  console.log(`📊 Estado inicial:`);
  console.log(`   Total clientes: ${totalClientes}`);
  console.log(`   Con medidor_id: ${clientesConMedidor}`);
  console.log(`   Sin medidor_id: ${totalClientes - clientesConMedidor}`);
  console.log('');

  // Step 2: Populate medidor_id for clients that have the address chain
  console.log('📍 Paso 1: Poblando medidor_id desde cadena direccion → medidor...');
  
  const result1 = await prisma.$executeRaw`
    UPDATE clientes c
    SET medidor_id = (
      SELECT m.id 
      FROM direcciones d 
      JOIN medidores m ON m.direccion_id = d.id 
      WHERE d.cliente_id = c.id 
      LIMIT 1
    )
    WHERE medidor_id IS NULL
  `;
  
  console.log(`   ✅ Actualizados: ${result1} clientes`);
  console.log('');

  // Step 3: For ANTERIOR clients, copy from the current client
  console.log('📍 Paso 2: Poblando medidor_id para clientes ANTERIOR...');
  
  const result2 = await prisma.$executeRaw`
    UPDATE clientes old_client
    SET medidor_id = (
      SELECT new_client.medidor_id
      FROM clientes new_client
      WHERE new_client.numero_cliente = REPLACE(old_client.numero_cliente, '-ANTERIOR', '')
        AND new_client.es_cliente_actual = true
      LIMIT 1
    )
    WHERE old_client.numero_cliente LIKE '%-ANTERIOR'
      AND old_client.medidor_id IS NULL
  `;
  
  console.log(`   ✅ Actualizados: ${result2} clientes ANTERIOR`);
  console.log('');

  // Step 4: Count clients after
  const clientesConMedidorDespues = await prisma.clientes.count({
    where: { medidor_id: { not: null } }
  });
  
  console.log(`📊 Estado final:`);
  console.log(`   Total clientes: ${totalClientes}`);
  console.log(`   Con medidor_id: ${clientesConMedidorDespues}`);
  console.log(`   Sin medidor_id: ${totalClientes - clientesConMedidorDespues}`);
  console.log('');

  // Step 5: Show which clients still don't have medidor_id
  const clientesSinMedidor = await prisma.clientes.findMany({
    where: { medidor_id: null },
    select: {
      numero_cliente: true,
      es_cliente_actual: true,
      fecha_inicio: true,
      fecha_termino: true
    }
  });

  if (clientesSinMedidor.length > 0) {
    console.log('⚠️ Clientes que aún no tienen medidor_id:');
    for (const c of clientesSinMedidor) {
      console.log(`   - ${c.numero_cliente} (actual: ${c.es_cliente_actual}, inicio: ${c.fecha_inicio?.toISOString().split('T')[0] || 'N/A'})`);
    }
    console.log('');
  }

  // Step 6: Verify ANTERIOR clients specifically
  console.log('📋 Verificando clientes ANTERIOR:');
  const anteriorClientes = await prisma.clientes.findMany({
    where: { 
      numero_cliente: { contains: '-ANTERIOR' } 
    },
    select: {
      numero_cliente: true,
      medidor_id: true,
      fecha_inicio: true,
      fecha_termino: true
    }
  });

  for (const c of anteriorClientes) {
    const status = c.medidor_id ? `✅ medidor_id=${c.medidor_id}` : '❌ SIN MEDIDOR';
    console.log(`   ${c.numero_cliente}: ${status} (${c.fecha_inicio?.toISOString().split('T')[0]} - ${c.fecha_termino?.toISOString().split('T')[0] || 'activo'})`);
  }
  console.log('');

  console.log('='.repeat(60));
  console.log('✅ PROCESO COMPLETADO');
  console.log('='.repeat(60));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

