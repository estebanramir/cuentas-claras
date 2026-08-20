/**
 * Dinero. Dos reglas que no se rompen nunca:
 *   1. Los montos se guardan como enteros en la unidad minima de su moneda.
 *      COP tiene exponente 0 ($150.000 -> 150000n), USD exponente 2 (12,99 -> 1299n).
 *   2. Las tasas de cambio son enteros escalados a 8 decimales, no floats.
 * Ningun monto pasa por Number en ningun punto del calculo.
 */

export type CurrencyCode = 'COP' | 'USD' | 'EUR';

export interface CurrencyInfo {
  exponent: number;
  symbol: string;
  name: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  COP: { exponent: 0, symbol: '$', name: 'Peso colombiano' },
  USD: { exponent: 2, symbol: 'US$', name: 'Dolar estadounidense' },
  EUR: { exponent: 2, symbol: '€', name: 'Euro' },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
export const BASE_CURRENCY: CurrencyCode = 'COP';

/** Las tasas viajan como enteros escalados: 3950.5 COP/USD -> 395050000000n */
export const RATE_SCALE = 8;
export const RATE_UNIT = 10n ** BigInt(RATE_SCALE);

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && v in CURRENCIES;
}

export function pow10(n: number): bigint {
  if (n < 0) throw new RangeError('pow10 no acepta exponentes negativos');
  return 10n ** BigInt(n);
}

/** Division entera con redondeo a la mitad hacia arriba, preservando el signo. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('division por cero');
  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  let q = a / b;
  if ((a % b) * 2n >= b) q += 1n;
  return negative ? -q : q;
}

/**
 * Convierte un monto a la moneda base aplicando la tasa congelada del gasto.
 * rateScaled son unidades de la moneda base por 1 unidad de `currency`, x10^8.
 */
export function toBaseMinor(
  amountMinor: bigint,
  currency: CurrencyCode,
  rateScaled: bigint,
  base: CurrencyCode = BASE_CURRENCY,
): bigint {
  if (currency === base) return amountMinor;
  if (rateScaled <= 0n) throw new RangeError('la tasa de cambio debe ser positiva');
  const numerator = amountMinor * rateScaled * pow10(CURRENCIES[base].exponent);
  const denominator = RATE_UNIT * pow10(CURRENCIES[currency].exponent);
  return divRoundHalfUp(numerator, denominator);
}

/** Convierte una tasa escrita por una persona ("3950.5") al entero escalado. */
export function parseRate(input: string | number): bigint {
  const raw = typeof input === 'number' ? numberToPlainString(input) : input.trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new RangeError(`tasa invalida: ${input}`);
  const [whole = '0', frac = ''] = raw.split('.');
  const padded = (frac + '0'.repeat(RATE_SCALE)).slice(0, RATE_SCALE);
  return BigInt(whole) * RATE_UNIT + BigInt(padded || '0');
}

export function formatRate(rateScaled: bigint): string {
  const whole = rateScaled / RATE_UNIT;
  const frac = (rateScaled % RATE_UNIT).toString().padStart(RATE_SCALE, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Lee lo que escribe una persona. Tolera "150.000", "150000", "12,99", "$ 1.234,56".
 * Para monedas sin decimales todo separador es de miles.
 */
export function parseAmount(input: string, currency: CurrencyCode): bigint {
  const exponent = CURRENCIES[currency].exponent;
  let s = input.trim().replace(/[^\d.,-]/g, '');
  if (!s) throw new RangeError('monto vacio');

  const negative = s.startsWith('-');
  s = s.replace(/-/g, '');

  let whole: string;
  let frac = '';

  if (exponent === 0) {
    whole = s.replace(/[.,]/g, '');
  } else {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    const sep = Math.max(lastDot, lastComma);
    const decimals = sep >= 0 ? s.length - sep - 1 : -1;
    // Un separador final con 1 o 2 digitos detras es decimal; con 3 es de miles.
    const isDecimalSep = sep >= 0 && decimals > 0 && decimals <= exponent;
    if (isDecimalSep) {
      whole = s.slice(0, sep).replace(/[.,]/g, '');
      frac = s.slice(sep + 1);
    } else {
      whole = s.replace(/[.,]/g, '');
    }
  }

  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) throw new RangeError(`monto invalido: ${input}`);
  const padded = (frac + '0'.repeat(exponent)).slice(0, exponent);
  const minor = BigInt(whole || '0') * pow10(exponent) + BigInt(padded || '0');
  return negative ? -minor : minor;
}

export interface FormatOptions {
  /** Antepone el simbolo de la moneda. Por defecto true. */
  symbol?: boolean;
  /** Fuerza el signo + en positivos. Util para balances. */
  signed?: boolean;
}

export function formatAmount(
  amountMinor: bigint,
  currency: CurrencyCode,
  options: FormatOptions = {},
): string {
  const { symbol = true, signed = false } = options;
  const { exponent, symbol: sym } = CURRENCIES[currency];
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const divisor = pow10(exponent);
  const whole = (abs / divisor).toString();
  const frac = exponent > 0 ? (abs % divisor).toString().padStart(exponent, '0') : '';

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = frac ? `${grouped},${frac}` : grouped;
  const sign = negative ? '-' : signed ? '+' : '';
  return symbol ? `${sign}${sym}${body}` : `${sign}${body}`;
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError('numero no finito');
  return n.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
}
