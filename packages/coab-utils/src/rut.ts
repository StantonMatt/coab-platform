/**
 * Chilean RUT (Rol Único Tributario) utilities
 * 
 * RUT format: XX.XXX.XXX-X where the last digit is the verification digit (DV)
 * Uses Modulus 11 algorithm for validation
 */

/**
 * Validates a Chilean RUT using Modulus 11 algorithm
 * @param rutStr - RUT in any format (with or without dots/dash)
 * @returns true if the RUT is valid
 * 
 * @example
 * validarRUT('12.345.678-5') // true
 * validarRUT('12345678-5')   // true
 * validarRUT('123456785')    // true
 * validarRUT('12.345.678-0') // false (invalid DV)
 */
export function validarRUT(rutStr: string): boolean {
  // Clean RUT (remove dots, dash, spaces)
  const cleaned = rutStr.replace(/[.\-\s]/g, '').toUpperCase();
  
  // RUT must be 8-9 characters (7-8 digits + DV)
  if (cleaned.length < 8 || cleaned.length > 9) return false;
  
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  
  // Body must be all digits
  if (!/^\d+$/.test(body)) return false;
  
  // DV must be digit or K
  if (!/^[0-9K]$/.test(dv)) return false;
  
  // Calculate verification digit using Modulus 11
  let sum = 0;
  let multiplier = 2;
  
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  
  const remainder = sum % 11;
  const expectedDV = 11 - remainder;
  const calculatedDV = expectedDV === 11 ? '0' : expectedDV === 10 ? 'K' : String(expectedDV);
  
  return dv === calculatedDV;
}

/**
 * Formats a RUT with dots and dash (XX.XXX.XXX-X)
 * @param rut - Clean or formatted RUT
 * @returns Formatted RUT string
 * 
 * @example
 * formatearRUT('123456785') // '12.345.678-5'
 * formatearRUT('12345678-5') // '12.345.678-5'
 */
export function formatearRUT(rut: string): string {
  const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  
  if (cleaned.length <= 1) return cleaned;
  
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  
  // Add dots every 3 digits from right
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  return `${formatted}-${dv}`;
}

/**
 * Removes formatting from RUT (returns digits + K only)
 * @param rut - Formatted or unformatted RUT
 * @returns Clean RUT string (uppercase)
 * 
 * @example
 * limpiarRUT('12.345.678-5') // '123456785'
 * limpiarRUT('12345678-k')   // '12345678K'
 */
export function limpiarRUT(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

/**
 * Extracts the body (without DV) from a RUT
 * @param rut - Any RUT format
 * @returns Body digits only
 * 
 * @example
 * obtenerCuerpoRUT('12.345.678-5') // '12345678'
 */
export function obtenerCuerpoRUT(rut: string): string {
  const cleaned = limpiarRUT(rut);
  return cleaned.slice(0, -1);
}

/**
 * Extracts the verification digit (DV) from a RUT
 * @param rut - Any RUT format
 * @returns DV character (0-9 or K)
 * 
 * @example
 * obtenerDV('12.345.678-5') // '5'
 * obtenerDV('12.345.678-K') // 'K'
 */
export function obtenerDV(rut: string): string {
  const cleaned = limpiarRUT(rut);
  return cleaned.slice(-1);
}

