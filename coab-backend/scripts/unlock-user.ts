/**
 * Unlock a user account that has been locked due to failed login attempts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Reset test user (ID 4)
  const cliente = await prisma.clientes.update({
    where: { id: 4n },
    data: {
      intentos_fallidos: 0,
      bloqueado_hasta: null,
    },
  });

  console.log('✅ Cuenta desbloqueada:');
  console.log(`   ${cliente.primer_nombre} ${cliente.primer_apellido}`);
  console.log(`   RUT: ${cliente.rut}`);
  console.log(`   Intentos fallidos: ${cliente.intentos_fallidos}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

