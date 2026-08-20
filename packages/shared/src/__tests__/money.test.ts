import { describe, expect, it } from 'vitest';
import {
  divRoundHalfUp,
  formatAmount,
  formatRate,
  parseAmount,
  parseRate,
  toBaseMinor,
} from '../money';

describe('divRoundHalfUp', () => {
  it('redondea la mitad hacia arriba', () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(4n, 2n)).toBe(2n);
    expect(divRoundHalfUp(1n, 3n)).toBe(0n);
    expect(divRoundHalfUp(2n, 3n)).toBe(1n);
  });

  it('preserva el signo', () => {
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfUp(5n, -2n)).toBe(-3n);
  });

  it('rechaza dividir por cero', () => {
    expect(() => divRoundHalfUp(1n, 0n)).toThrow();
  });
});

describe('parseAmount', () => {
  it('lee pesos con separador de miles', () => {
    expect(parseAmount('150.000', 'COP')).toBe(150000n);
    expect(parseAmount('$ 1.234.567', 'COP')).toBe(1234567n);
    expect(parseAmount('150000', 'COP')).toBe(150000n);
  });

  it('ignora decimales en monedas sin decimales', () => {
    expect(parseAmount('1.500', 'COP')).toBe(1500n);
  });

  it('lee dolares con coma o punto decimal', () => {
    expect(parseAmount('12,99', 'USD')).toBe(1299n);
    expect(parseAmount('12.99', 'USD')).toBe(1299n);
    expect(parseAmount('1.234,56', 'USD')).toBe(123456n);
    expect(parseAmount('1,234.56', 'USD')).toBe(123456n);
  });

  it('trata un separador de tres digitos como miles', () => {
    expect(parseAmount('1.500', 'USD')).toBe(150000n);
  });

  it('rechaza basura', () => {
    expect(() => parseAmount('', 'COP')).toThrow();
    expect(() => parseAmount('abc', 'COP')).toThrow();
  });
});

describe('formatAmount', () => {
  it('agrupa miles al estilo colombiano', () => {
    expect(formatAmount(150000n, 'COP')).toBe('$150.000');
    expect(formatAmount(1234567n, 'COP')).toBe('$1.234.567');
    expect(formatAmount(0n, 'COP')).toBe('$0');
  });

  it('muestra decimales donde corresponde', () => {
    expect(formatAmount(1299n, 'USD')).toBe('US$12,99');
    expect(formatAmount(5n, 'USD')).toBe('US$0,05');
  });

  it('marca el signo cuando se pide', () => {
    expect(formatAmount(25000n, 'COP', { signed: true })).toBe('+$25.000');
    expect(formatAmount(-25000n, 'COP')).toBe('-$25.000');
    expect(formatAmount(25000n, 'COP', { symbol: false })).toBe('25.000');
  });
});

describe('tasas', () => {
  it('escala y desescala sin perder precision', () => {
    expect(parseRate('3950')).toBe(395000000000n);
    expect(parseRate('3950.5')).toBe(395050000000n);
    expect(formatRate(parseRate('3950.5'))).toBe('3950.5');
    expect(formatRate(parseRate('3950'))).toBe('3950');
  });

  it('rechaza tasas invalidas', () => {
    expect(() => parseRate('-1')).toThrow();
    expect(() => parseRate('abc')).toThrow();
  });
});

describe('toBaseMinor', () => {
  it('convierte dolares a pesos con la tasa congelada', () => {
    // 12,99 USD x 3.950 = 51.310,5 -> 51.311
    expect(toBaseMinor(1299n, 'USD', parseRate('3950'))).toBe(51311n);
  });

  it('deja intactos los montos que ya estan en la base', () => {
    expect(toBaseMinor(150000n, 'COP', parseRate('1'))).toBe(150000n);
  });

  it('rechaza tasas no positivas para monedas extranjeras', () => {
    expect(() => toBaseMinor(1299n, 'USD', 0n)).toThrow();
  });
});
