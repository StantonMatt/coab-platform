import { PrismaClient } from '@prisma/client';

interface ClientValidationResult {
  validClients: any[];
  skippedClients: string[];
  duplicateClients: Map<string, number>;
}

/**
 * Validates and filters clients for boleta generation
 */
export async function validateAndFilterClients(
  prisma: PrismaClient,
  periodoInicio: Date,
  periodoFin: Date
): Promise<ClientValidationResult> {
  console.log(`🔍 Buscando clientes activos...`);
  
  // Get all clients active during this month
  const clientes = await prisma.clientes.findMany({
    where: { 
      recibe_factura: false,
      // Client was active if they started before month ended AND ended after month started (or still active)
      fecha_inicio: { lte: periodoFin },
      OR: [
        { fecha_termino: null }, // Still active
        { fecha_termino: { gte: periodoInicio } } // Ended during or after this month
      ]
    },
    orderBy: [
      { numero_cliente: 'asc' },
      { fecha_inicio: 'asc' } // Ensure older clients come first for duplicates
    ]
  });
  
  console.log(`📊 Encontrados ${clientes.length} clientes activos sin factura\n`);
  
  // Track duplicates and filter valid clients
  const validClients: any[] = [];
  const skippedClients: string[] = [];
  const duplicateClients = new Map<string, number>();
  const seenNumeros = new Set<string>();
  
  for (const cliente of clientes) {
    // Check for duplicates
    if (seenNumeros.has(cliente.numero_cliente)) {
      const count = (duplicateClients.get(cliente.numero_cliente) || 1) + 1;
      duplicateClients.set(cliente.numero_cliente, count);
      
      // Skip if not the current client
      if (!cliente.es_cliente_actual) {
        skippedClients.push(`${cliente.numero_cliente} (ID: ${cliente.id}) - Cliente duplicado no actual`);
        continue;
      }
    }
    
    // For old clients, verify they were active during this period
    if (!cliente.es_cliente_actual) {
      const wasActiveInMonth = cliente.fecha_inicio !== null && 
                               new Date(cliente.fecha_inicio) <= periodoFin &&
                               (!cliente.fecha_termino || new Date(cliente.fecha_termino) >= periodoInicio);
      
      if (!wasActiveInMonth) {
        skippedClients.push(`${cliente.numero_cliente} (ID: ${cliente.id}) - Cliente inactivo en el período`);
        continue;
      }
    }
    
    seenNumeros.add(cliente.numero_cliente);
    validClients.push(cliente);
  }
  
  // Report validation results
  if (duplicateClients.size > 0) {
    console.log(`⚠️ Se encontraron ${duplicateClients.size} números de cliente duplicados:`);
    for (const [numero, count] of Array.from(duplicateClients)) {
      console.log(`   - ${numero}: ${count} registros`);
    }
    console.log('');
  }
  
  if (skippedClients.length > 0) {
    console.log(`⏭️ Se omitieron ${skippedClients.length} clientes:`);
    if (skippedClients.length <= 10) {
      skippedClients.forEach(msg => console.log(`   - ${msg}`));
    } else {
      skippedClients.slice(0, 5).forEach(msg => console.log(`   - ${msg}`));
      console.log(`   ... y ${skippedClients.length - 5} más`);
    }
    console.log('');
  }
  
  console.log(`✅ ${validClients.length} clientes válidos para procesar\n`);
  
  return {
    validClients,
    skippedClients,
    duplicateClients
  };
}

/**
 * Checks if a client should be processed based on various criteria
 */
export function shouldProcessClient(
  cliente: any,
  processedNumeros: Set<string>,
  periodoInicio: Date,
  periodoFin: Date
): { shouldProcess: boolean; reason?: string } {
  // Skip if already processed
  if (processedNumeros.has(cliente.numero_cliente)) {
    return { 
      shouldProcess: false, 
      reason: `Duplicado ya procesado` 
    };
  }
  
  // For old clients, verify activity during period
  if (!cliente.es_cliente_actual) {
    const wasActiveInMonth = cliente.fecha_inicio !== null && 
                             new Date(cliente.fecha_inicio) <= periodoFin &&
                             (!cliente.fecha_termino || new Date(cliente.fecha_termino) >= periodoInicio);
    
    if (!wasActiveInMonth) {
      return { 
        shouldProcess: false, 
        reason: `Cliente inactivo en el período` 
      };
    }
  }
  
  return { shouldProcess: true };
}