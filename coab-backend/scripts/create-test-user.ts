/**
 * Create a test customer user with a password for development
 * 
 * Usage: npx tsx scripts/create-test-user.ts
 * 
 * This will find an existing customer and set up a password for them,
 * or you can specify a RUT to target.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { formatearRUT } from '@coab/utils';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'Test1234';

async function main() {
  console.log('🔧 Configurando usuario de prueba...\n');

  // Find a customer with a RUT
  const cliente = await prisma.clientes.findFirst({
    where: {
      rut: { not: null },
      es_cliente_actual: true,
    },
    orderBy: { id: 'asc' },
  });

  if (!cliente) {
    console.log('❌ No se encontró ningún cliente con RUT en la base de datos.');
    console.log('   Ejecuta este script después de tener clientes en la BD.\n');
    process.exit(1);
  }

  console.log('📋 Cliente encontrado:');
  console.log(`   ID: ${cliente.id}`);
  console.log(`   RUT: ${formatearRUT(cliente.rut!)}`);
  console.log(`   Nombre: ${cliente.primer_nombre} ${cliente.primer_apellido}`);
  console.log(`   N° Cliente: ${cliente.numero_cliente}\n`);

  // Hash the password with Argon2id
  console.log('🔐 Generando hash de contraseña con Argon2id...');
  const hashedPassword = await hash(TEST_PASSWORD, {
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });

  // Update the customer
  await prisma.clientes.update({
    where: { id: cliente.id },
    data: {
      hash_contrasena: hashedPassword,
      estado_cuenta: 'activa',
      intentos_fallidos: 0,
      bloqueado_hasta: null,
    },
  });

  console.log('✅ Usuario de prueba configurado!\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  CREDENCIALES DE PRUEBA');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  RUT:        ${formatearRUT(cliente.rut!)}`);
  console.log(`  Contraseña: ${TEST_PASSWORD}`);
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('Usa estas credenciales en http://localhost:5173/login\n');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

