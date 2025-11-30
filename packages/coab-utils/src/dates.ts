/**
 * Chilean date formatting utilities
 * 
 * Uses date-fns with Spanish (es) locale
 * Common Chilean formats:
 * - dd/MM/yyyy (e.g., 15/10/2025)
 * - d 'de' MMMM 'de' yyyy (e.g., 15 de octubre de 2025)
 * - d 'de' MMMM 'a las' HH:mm (e.g., 15 de octubre a las 14:30)
 */

import { format as dateFnsFormat } from 'date-fns';
import { es } from 'date-fns/locale';

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
} as const;

/**
 * Formats a date using Chilean locale (es-CL)
 * @param date - Date to format
 * @param formato - Format string (use FORMATOS_FECHA constants)
 * @returns Formatted date string
 * 
 * @example
 * formatearFecha(new Date(), FORMATOS_FECHA.CORTO)    // '15/10/2025'
 * formatearFecha(new Date(), FORMATOS_FECHA.LARGO)    // '15 de octubre de 2025'
 * formatearFecha(new Date(), FORMATOS_FECHA.CON_HORA) // '15 de octubre a las 14:30'
 */
export function formatearFecha(date: Date | string, formato: string = FORMATOS_FECHA.CORTO): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateFnsFormat(dateObj, formato, { locale: es });
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
 * Re-export es locale for direct use with date-fns
 */
export { es as localeES } from 'date-fns/locale';

