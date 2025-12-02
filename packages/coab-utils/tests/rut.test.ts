import { describe, it, expect } from 'vitest';
import { validarRUT, formatearRUT, limpiarRUT, obtenerCuerpoRUT, obtenerDV } from '../src/rut';

describe('validarRUT', () => {
  it('valida RUTs correctos', () => {
    // RUTs de ejemplo válidos (generados con algoritmo Modulus 11)
    expect(validarRUT('11111111-1')).toBe(true);
    expect(validarRUT('22222222-2')).toBe(true);
    expect(validarRUT('12345678-5')).toBe(true);
    expect(validarRUT('17608393-K')).toBe(true); // RUT with K as DV
    expect(validarRUT('17608393-k')).toBe(true); // lowercase K
  });

  it('valida RUTs con formato (puntos y guión)', () => {
    expect(validarRUT('11.111.111-1')).toBe(true);
    expect(validarRUT('12.345.678-5')).toBe(true);
    expect(validarRUT('17.608.393-K')).toBe(true);
  });

  it('rechaza RUTs con DV incorrecto', () => {
    expect(validarRUT('11111111-0')).toBe(false);
    expect(validarRUT('12345678-0')).toBe(false);
    expect(validarRUT('12345678-K')).toBe(false);
  });

  it('rechaza RUTs con formato inválido', () => {
    expect(validarRUT('')).toBe(false);
    expect(validarRUT('123')).toBe(false);
    expect(validarRUT('1234567890')).toBe(false); // muy largo
    expect(validarRUT('abcdefgh-i')).toBe(false);
  });

  it('maneja espacios y caracteres extra', () => {
    expect(validarRUT(' 11.111.111-1 ')).toBe(true);
    expect(validarRUT('11 111 111-1')).toBe(true);
  });
});

describe('formatearRUT', () => {
  it('formatea RUTs sin formato', () => {
    expect(formatearRUT('111111111')).toBe('11.111.111-1');
    expect(formatearRUT('123456785')).toBe('12.345.678-5');
    expect(formatearRUT('7654321K')).toBe('7.654.321-K');
  });

  it('normaliza RUTs ya formateados', () => {
    expect(formatearRUT('11.111.111-1')).toBe('11.111.111-1');
    expect(formatearRUT('11-111-111-1')).toBe('11.111.111-1');
  });

  it('convierte K minúscula a mayúscula', () => {
    expect(formatearRUT('7654321k')).toBe('7.654.321-K');
  });

  it('maneja RUTs cortos', () => {
    expect(formatearRUT('1')).toBe('1');
    expect(formatearRUT('12')).toBe('1-2');
  });
});

describe('limpiarRUT', () => {
  it('remueve puntos y guiones', () => {
    expect(limpiarRUT('11.111.111-1')).toBe('111111111');
    expect(limpiarRUT('12.345.678-5')).toBe('123456785');
    expect(limpiarRUT('7.654.321-K')).toBe('7654321K');
  });

  it('convierte K a mayúscula', () => {
    expect(limpiarRUT('7654321-k')).toBe('7654321K');
  });
});

describe('obtenerCuerpoRUT', () => {
  it('extrae el cuerpo del RUT', () => {
    expect(obtenerCuerpoRUT('11.111.111-1')).toBe('11111111');
    expect(obtenerCuerpoRUT('12345678-5')).toBe('12345678');
    expect(obtenerCuerpoRUT('7654321K')).toBe('7654321');
  });
});

describe('obtenerDV', () => {
  it('extrae el dígito verificador', () => {
    expect(obtenerDV('11.111.111-1')).toBe('1');
    expect(obtenerDV('12345678-5')).toBe('5');
    expect(obtenerDV('7.654.321-K')).toBe('K');
    expect(obtenerDV('7654321k')).toBe('K');
  });
});

