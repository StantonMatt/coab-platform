import { describe, it, expect } from 'vitest';
import { formatearPesos, formatearNumero, parsearPesos } from '../src/currency';

describe('formatearPesos', () => {
  it('formatea números positivos', () => {
    expect(formatearPesos(0)).toBe('$0');
    expect(formatearPesos(100)).toBe('$100');
    expect(formatearPesos(1000)).toBe('$1.000');
    expect(formatearPesos(1234567)).toBe('$1.234.567');
  });

  it('formatea números negativos', () => {
    // es-CL Intl format places minus after the currency symbol
    expect(formatearPesos(-1000)).toBe('$-1.000');
    expect(formatearPesos(-1234567)).toBe('$-1.234.567');
  });

  it('no incluye decimales', () => {
    expect(formatearPesos(1234.56)).toBe('$1.235'); // rounds
    expect(formatearPesos(1234.4)).toBe('$1.234');
  });
});

describe('formatearNumero', () => {
  it('formatea números con separador de miles', () => {
    expect(formatearNumero(1000)).toBe('1.000');
    expect(formatearNumero(1234567)).toBe('1.234.567');
  });
});

describe('parsearPesos', () => {
  it('parsea strings formateados', () => {
    expect(parsearPesos('$1.234.567')).toBe(1234567);
    expect(parsearPesos('$1.000')).toBe(1000);
    expect(parsearPesos('$100')).toBe(100);
  });

  it('parsea strings sin símbolo', () => {
    expect(parsearPesos('1.234.567')).toBe(1234567);
    expect(parsearPesos('1000')).toBe(1000);
  });

  it('retorna 0 para strings inválidos', () => {
    expect(parsearPesos('')).toBe(0);
    expect(parsearPesos('abc')).toBe(0);
  });
});

