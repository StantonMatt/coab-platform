/**
 * Chilean currency (CLP) formatting utilities
 * 
 * Chilean Peso uses:
 * - Dot (.) as thousands separator
 * - No decimal places (integer currency)
 * - $ symbol prefix
 */

/**
 * Formats a number as Chilean Pesos (CLP)
 * @param amount - Amount in CLP (integer)
 * @returns Formatted string like "$1.234.567"
 * 
 * @example
 * formatearPesos(1234567)  // '$1.234.567'
 * formatearPesos(0)        // '$0'
 * formatearPesos(-5000)    // '-$5.000'
 */
export function formatearPesos(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Formats a number with Chilean thousands separator (dot)
 * @param value - Number to format
 * @returns Formatted string like "1.234.567"
 * 
 * @example
 * formatearNumero(1234567) // '1.234.567'
 */
export function formatearNumero(value: number): string {
  return new Intl.NumberFormat('es-CL').format(value);
}

/**
 * Parses a Chilean-formatted currency string to number
 * @param value - Formatted string like "$1.234.567" or "1.234.567"
 * @returns Parsed number
 * 
 * @example
 * parsearPesos('$1.234.567') // 1234567
 * parsearPesos('1.234.567')  // 1234567
 */
export function parsearPesos(value: string): number {
  // Remove currency symbol and dots, keep minus sign
  const cleaned = value.replace(/[$.\s]/g, '').replace(',', '.');
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
}

