/**
 * Boleta Generation Module
 * 
 * This module contains all the logic for generating monthly boletas (bills)
 * for customers. It handles meter readings, consumption calculations, 
 * subsidies, discounts, fines, and payment plans.
 */

// Types
export * from './types/index.js';

// Configuration
export { createBoletaConfig } from './modules/config.js';

// Client validation
export { validateAndFilterClients, shouldProcessClient } from './modules/client-validator.js';

// Folio management
export { FolioManager, determineStartingFolio } from './modules/folio-manager.js';

// Batch processing
export { 
  batchFetchMeterReadings,
  batchFetchReadingCorrections,
  batchFetchSubsidies,
  batchFetchDiscounts,
  batchFetchSaldosAnteriores,
  batchFetchNotasDeCredito,
  batchFetchRepactaciones,
  batchFetchMultas,
  batchFetchReposiciones,
  batchFetchAll
} from './modules/batch-processor.js';

// Batch updates
export {
  batchUpdateNotasCredito,
  batchUpdateMultas,
  batchUpdateReposiciones,
  batchUpdateDescuentos,
  batchCreateBoletas,
  getBoletasMapping,
  batchUpdateCorrections,
  performBatchUpdates
} from './modules/batch-updater.js';

// Core generation
export { generateMonthlyBoleta } from './modules/boleta-generator.js';

// Individual processors (for non-batch use)
export { getMeterAndReadings } from './modules/meter-reader.js';
export { calculateBaseCharges, applyDiscounts, calculateIVA, adjustChargesForFines } from './modules/charge-calculator.js';
export { getClientSubsidy, calculateSubsidy } from './modules/subsidy-calculator.js';
export { calculateSaldoAnterior, applyNotasDeCredito } from './modules/credit-manager.js';
export { processMultas } from './modules/multa-processor.js';
export { processReposiciones, processReposicionesFromCache } from './modules/reposicion-processor.js';
export { calculateRepactacion, addCargosToRepactacion } from './modules/repactacion-handler.js';

// Data processors for cache
export {
  processMeterReadingsFromCache,
  processDiscountsFromCache,
  processSubsidiesFromCache,
  processRepactacionFromCache,
  processMultasFromCache,
  processNotasCreditoFromCache
} from './modules/data-processor.js';

