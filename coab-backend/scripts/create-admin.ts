/**
 * Script to create an admin user in the perfiles table
 * Usage: npx tsx scripts/create-admin.ts
 */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function createAdmin() {
  // Default admin credentials (change password after first login in production)
  const email = process.env.ADMIN_EMAIL || 'admin@coab.cl';
  const password = process.env.ADMIN_PASSWORD || 'Admin1234!';
  const nombre = process.env.ADMIN_NOMBRE || 'Administrador';
  const apellido = process.env.ADMIN_APELLIDO || 'COAB';
  const rol = process.env.ADMIN_ROL || 'admin';

  console.log('🔧 Creando usuario administrador...');
  console.log(`   Email: ${email}`);
  console.log(`   Rol: ${rol}`);

  // Check if admin already exists
  const existing = await prisma.perfiles.findFirst({
    where: { correo: email.toLowerCase() },
  });

  if (existing) {
    console.log('⚠️  El administrador ya existe. Actualizando contraseña...');

    // Hash password with Argon2id
    const hashContrasena = await hash(password, {
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });

    await prisma.perfiles.update({
      where: { id: existing.id },
      data: {
        hash_contrasena: hashContrasena,
        is_admin: true,
        rol,
        intentos_fallidos: 0,
        bloqueado_hasta: null,
      },
    });

    console.log('✅ Contraseña actualizada exitosamente');
    console.log(`\n📋 Credenciales de acceso:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    return;
  }

  // Hash password with Argon2id
  const hashContrasena = await hash(password, {
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });

  // Create admin user
  const admin = await prisma.perfiles.create({
    data: {
      id: randomUUID(),
      nombre,
      apellido,
      correo: email.toLowerCase(),
      hash_contrasena: hashContrasena,
      is_admin: true,
      rol,
      intentos_fallidos: 0,
      fecha_creacion: new Date(),
    },
  });

  console.log('✅ Administrador creado exitosamente');
  console.log(`   ID: ${admin.id}`);
  console.log(`\n📋 Credenciales de acceso:`);
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`\n⚠️  IMPORTANTE: Cambie la contraseña después del primer inicio de sesión`);
}

createAdmin()
  .catch((error) => {
    console.error('❌ Error al crear administrador:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
