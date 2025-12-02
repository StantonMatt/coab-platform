import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import * as readline from 'readline';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

/**
 * Script para crear un usuario administrador
 * Uso: npx tsx scripts/create-admin.ts
 */

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║       COAB Platform - Crear Administrador            ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Get admin details
  const nombre = await prompt('Nombre: ');
  const apellido = await prompt('Apellido: ');
  const correo = await prompt('Correo electrónico: ');
  const contrasena = await prompt('Contraseña (mín. 8 caracteres): ');

  // Validate password
  if (contrasena.length < 8) {
    console.error('❌ Error: La contraseña debe tener al menos 8 caracteres');
    process.exit(1);
  }

  // Check if admin with this email already exists
  const existingAdmin = await prisma.perfiles.findFirst({
    where: { correo },
  });

  if (existingAdmin) {
    console.error(`❌ Error: Ya existe un usuario con el correo ${correo}`);
    process.exit(1);
  }

  // Hash password with Argon2id
  const hash_contrasena = await argon2.hash(contrasena, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64MB
    timeCost: 3,
    parallelism: 4,
  });

  // Create admin user
  const admin = await prisma.perfiles.create({
    data: {
      id: randomUUID(),
      nombre,
      apellido,
      correo,
      hash_contrasena,
      is_admin: true,
      rol: 'admin',
      fecha_creacion: new Date(),
      fecha_actualizacion: new Date(),
    },
  });

  console.log('\n✅ Administrador creado exitosamente:');
  console.log(`   ID: ${admin.id}`);
  console.log(`   Nombre: ${admin.nombre} ${admin.apellido}`);
  console.log(`   Correo: ${admin.correo}`);
  console.log(`   Rol: ${admin.rol}`);
  console.log('\nPuede iniciar sesión en el portal de administración.');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });







