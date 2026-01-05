/**
 * Chilean date formatting utilities
 * 
 * Uses date-fns with date-fns-tz for proper Chile timezone handling
 * Common Chilean formats:
 * - dd/MM/yyyy (e.g., 15/10/2025)
 * - d 'de' MMMM 'de' yyyy (e.g., 15 de octubre de 2025)
 * - d 'de' MMMM 'a las' HH:mm (e.g., 15 de octubre a las 14:30)
 */

import { formatInTimeZone } from 'date-fns-tz';
import { es } from 'date-fns/locale';

/**
 * Chile timezone constant
 */
export const CHILE_TIMEZONE = 'America/Santiago';

/**
 * Common Chilean date formats
 */
export const FORMATOS_FECHA = {
  /** 15/10/2025 */
  CORTO: 'dd/MM/yyyy',
  /** 15 de octubre de 2025 */
  LARGO: "d 'de' MMMM 'de' yyyy",
  /** 15 de octubre a las 14:30 */
  CON_HORA: "d 'de' MMMM 'a las' HH:mm",
  /** octubre 2025 */
  MES_ANIO: 'MMMM yyyy',
  /** 14:30 */
  HORA: 'HH:mm',
  /** 15/10/2025 14:30 */
  CORTO_CON_HORA: 'dd/MM/yyyy HH:mm',
  /** 15/10/25 (short year) */
  CORTO_ANIO_CORTO: 'dd/MM/yy',
} as const;

/**
 * Formats a date using Chilean timezone (America/Santiago)
 * This ensures dates are always displayed correctly regardless of the user's browser timezone.
 * 
 * @param date - Date to format (Date object or ISO string), or null/undefined
 * @param formato - Format string (use FORMATOS_FECHA constants)
 * @returns Formatted date string in Chilean timezone, or '-' if date is null/undefined
 * 
 * @example
 * formatearFecha(new Date(), FORMATOS_FECHA.CORTO)    // '15/10/2025'
 * formatearFecha(new Date(), FORMATOS_FECHA.LARGO)    // '15 de octubre de 2025'
 * formatearFecha(new Date(), FORMATOS_FECHA.CON_HORA) // '15 de octubre a las 14:30'
 * formatearFecha('2024-01-15T00:00:00.000Z', FORMATOS_FECHA.CORTO) // '15/01/2024' (not 14/01!)
 * formatearFecha(null, FORMATOS_FECHA.CORTO)          // '-'
 */
export function formatearFecha(date: Date | string | null | undefined, formato: string = FORMATOS_FECHA.CORTO): string {
  // Handle null/undefined values gracefully
  if (date === null || date === undefined) {
    return '-';
  }
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Check for invalid date
  if (isNaN(dateObj.getTime())) {
    return '-';
  }
  
  return formatInTimeZone(dateObj, CHILE_TIMEZONE, formato, { locale: es });
}

/**
 * Formats a date as short format (dd/MM/yyyy)
 * @param date - Date to format
 * @returns Formatted string like "15/10/2025"
 */
export function formatearFechaCorta(date: Date | string): string {
  return formatearFecha(date, FORMATOS_FECHA.CORTO);
}

/**
 * Formats a date as long format with month name
 * @param date - Date to format
 * @returns Formatted string like "15 de octubre de 2025"
 */
export function formatearFechaLarga(date: Date | string): string {
  return formatearFecha(date, FORMATOS_FECHA.LARGO);
}

/**
 * Formats a date with time
 * @param date - Date to format
 * @returns Formatted string like "15 de octubre a las 14:30"
 */
export function formatearFechaHora(date: Date | string): string {
  return formatearFecha(date, FORMATOS_FECHA.CON_HORA);
}

/**
 * Formats a period (month/year) for boletas
 * @param date - Date to format
 * @returns Formatted string like "octubre 2025"
 */
export function formatearPeriodo(date: Date | string): string {
  return formatearFecha(date, FORMATOS_FECHA.MES_ANIO);
}

/**
 * Formats a DATE field from the database (stored as midnight UTC).
 * This function extracts the UTC date components WITHOUT timezone conversion,
 * preventing dates like "2024-01-01 00:00:00+00" from displaying as "31/12/2023".
 * 
 * Use this for PostgreSQL DATE columns (not TIMESTAMPTZ).
 * 
 * @param date - Date to format (Date object or ISO string from database), or null/undefined
 * @param formato - Format string (use FORMATOS_FECHA constants, but without time components)
 * @returns Formatted date string preserving the original UTC date, or '-' if date is null/undefined
 * 
 * @example
 * // Database has: 2024-01-01 00:00:00+00
 * formatearFechaSinHora('2024-01-01T00:00:00.000Z', FORMATOS_FECHA.CORTO) // '01/01/2024' ✓
 * formatearFecha('2024-01-01T00:00:00.000Z', FORMATOS_FECHA.CORTO)        // '31/12/2023' ✗
 * formatearFechaSinHora(null, FORMATOS_FECHA.CORTO)                       // '-'
 */
export function formatearFechaSinHora(date: Date | string | null | undefined, formato: string = FORMATOS_FECHA.CORTO): string {
  // Handle null/undefined values gracefully
  if (date === null || date === undefined) {
    return '-';
  }
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Check for invalid date
  if (isNaN(dateObj.getTime())) {
    return '-';
  }
  
  // Extract UTC date components to avoid timezone shift
  const year = dateObj.getUTCFullYear();
  const month = dateObj.getUTCMonth();
  const day = dateObj.getUTCDate();
  
  // Create a new date at noon UTC to avoid any edge cases, then format in UTC
  const utcNoon = new Date(Date.UTC(year, month, day, 12, 0, 0));
  
  // Format in UTC timezone to preserve the original date
  return formatInTimeZone(utcNoon, 'UTC', formato, { locale: es });
}

/**
 * Re-export es locale for direct use with date-fns
 */
export { es as localeES } from 'date-fns/locale';
