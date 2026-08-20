import { Prisma, prisma } from '@cuentas/db';
import {
  BASE_CURRENCY,
  CURRENCY_CODES,
  type CivilDate,
  type CurrencyCode,
  RATE_UNIT,
  parseRate,
  todayInBogota,
} from '@cuentas/shared';
import { badRequest } from './http';

const SOURCE = 'https://open.er-api.com/v6/latest/USD';

interface RatesResponse {
  result?: string;
  rates?: Record<string, number>;
}

/**
 * Trae las tasas del dia y las guarda como pesos por unidad de moneda.
 * La fuente publica cotiza todo contra el dolar, asi que los pesos por euro
 * salen de dividir COP/USD entre EUR/USD.
 */
export async function syncDailyRates(date: CivilDate = todayInBogota()): Promise<number> {
  const response = await fetch(SOURCE, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`la fuente de tasas respondio ${response.status}`);
  const data = (await response.json()) as RatesResponse;
  const rates = data.rates;
  if (!rates?.COP) throw new Error('la fuente de tasas no trajo el peso colombiano');

  const copPerUsd = rates.COP;
  const entries: { currency: CurrencyCode; copPerUnit: number }[] = [];
  for (const currency of CURRENCY_CODES) {
    if (currency === BASE_CURRENCY) continue;
    if (currency === 'USD') {
      entries.push({ currency, copPerUnit: copPerUsd });
      continue;
    }
    const perUsd = rates[currency];
    if (perUsd && perUsd > 0) entries.push({ currency, copPerUnit: copPerUsd / perUsd });
  }

  const stamp = toDbDate(date);
  for (const entry of entries) {
    const value = new Prisma.Decimal(entry.copPerUnit.toFixed(8));
    await prisma.fxRate.upsert({
      where: { date_currency: { date: stamp, currency: entry.currency } },
      create: { date: stamp, currency: entry.currency, copPerUnit: value },
      update: { copPerUnit: value, fetchedAt: new Date() },
    });
  }
  return entries.length;
}

/**
 * La tasa que le corresponde a un gasto. Congela la del dia de la fecha del
 * gasto; si ese dia no se alcanzo a sincronizar, usa la ultima anterior, para
 * que registrar un gasto nunca dependa de que una API externa este arriba.
 */
export async function resolveRate(currency: CurrencyCode, date: CivilDate): Promise<bigint> {
  if (currency === BASE_CURRENCY) return RATE_UNIT;

  const stamp = toDbDate(date);
  const exact = await prisma.fxRate.findUnique({
    where: { date_currency: { date: stamp, currency } },
  });
  const row =
    exact ??
    (await prisma.fxRate.findFirst({
      where: { currency, date: { lte: stamp } },
      orderBy: { date: 'desc' },
    }));

  if (!row) {
    throw badRequest(
      `Todavia no tenemos la tasa del ${currency}. Escribe la tasa a mano en el gasto.`,
    );
  }
  return parseRate(row.copPerUnit.toString());
}

/** Convierte el string que escribio la persona, si decidio poner la tasa a mano. */
export function manualRate(input: string | undefined, currency: CurrencyCode): bigint | null {
  if (input === undefined) return null;
  if (currency === BASE_CURRENCY) return RATE_UNIT;
  const rate = parseRate(input);
  if (rate <= 0n) throw badRequest('La tasa de cambio debe ser mayor que cero');
  return rate;
}

export function toDbDate(date: CivilDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): CivilDate {
  return date.toISOString().slice(0, 10);
}

export function rateToDecimal(rateScaled: bigint): Prisma.Decimal {
  const whole = rateScaled / RATE_UNIT;
  const frac = (rateScaled % RATE_UNIT).toString().padStart(8, '0');
  return new Prisma.Decimal(`${whole}.${frac}`);
}
