import { PrismaClient } from '@prisma/client';
import { BoletaConfig } from '../types';

/**
 * Manages folio numbers for boletas
 */
export class FolioManager {
  private currentFolio: number;
  
  constructor(initialFolio: number) {
    this.currentFolio = initialFolio;
  }
  
  /**
   * Gets the next folio number and increments the counter
   */
  getNext(): number {
    return this.currentFolio++;
  }
  
  /**
   * Gets the current folio without incrementing
   */
  getCurrent(): number {
    return this.currentFolio;
  }
  
  /**
   * Gets the last used folio (current - 1)
   */
  getLastUsed(): number {
    return this.currentFolio - 1;
  }
}

/**
 * Determines the starting folio number for a given period
 */
export async function determineStartingFolio(
  prisma: PrismaClient,
  config: BoletaConfig,
  yearMonth: string,
  startingFolioJanuary2024: number
): Promise<number> {
  // Check if this is the first month (January 2024)
  if (yearMonth === '2024-01') {
    console.log(`📄 Usando folio inicial para enero 2024: ${startingFolioJanuary2024}\n`);
    return startingFolioJanuary2024;
  }
  
  // For all other months, get the last folio from previous month
  const lastBoleta = await prisma.boletas.findFirst({
    where: {
      periodo_desde: config.prevMonthInicio,
      periodo_hasta: config.prevMonthFin
    },
    orderBy: { numero_folio: 'desc' }
  });
  
  if (lastBoleta && lastBoleta.numero_folio) {
    const nextFolio = parseInt(lastBoleta.numero_folio) + 1;
    console.log(`📄 Continuando desde folio anterior: ${nextFolio} (último: ${lastBoleta.numero_folio})\n`);
    return nextFolio;
  }
  
  throw new Error(
    `No se encontraron boletas del mes anterior (${config.prevMonthInicio.toISOString().substring(0, 7)}). ` +
    `Por favor, genere primero las boletas del mes anterior.`
  );
}