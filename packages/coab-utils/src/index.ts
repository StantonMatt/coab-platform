/**
 * @coab/utils - Shared utilities for COAB Platform
 * 
 * Chilean-specific utilities for:
 * - RUT validation and formatting
 * - CLP currency formatting
 * - Date formatting with es-CL locale
 */

// RUT utilities
export {
  validarRUT,
  formatearRUT,
  limpiarRUT,
  obtenerCuerpoRUT,
  obtenerDV
} from './rut.js';

// Currency utilities
export {
  formatearPesos,
  formatearNumero,
  parsearPesos
} from './currency.js';

// Date utilities
export {
  formatearFecha,
  formatearFechaCorta,
  formatearFechaLarga,
  formatearFechaHora,
  formatearPeriodo,
  formatearFechaSinHora,
  FORMATOS_FECHA,
  CHILE_TIMEZONE,
  localeES
} from './dates.js';

