/**
 * Fechas civiles, sin horas y sin husos.
 *
 * Un vencimiento es "el 15", no "el 15 a las 00:00 en algun huso". Todo lo que
 * tenga que ver con fechas de la app se maneja como texto YYYY-MM-DD, y la unica
 * traduccion a hora real ocurre al preguntar "que dia es hoy en Bogota".
 */

export type CivilDate = string; // YYYY-MM-DD

export const TIMEZONE = 'America/Bogota';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isCivilDate(value: unknown): value is CivilDate {
  return typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function assertCivilDate(value: string): CivilDate {
  if (!isCivilDate(value)) throw new RangeError(`fecha invalida: ${value}`);
  return value;
}

/** Hoy en Bogota, sin importar donde corra el servidor. */
export function todayInBogota(now: Date = new Date()): CivilDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts as CivilDate;
}

export function toParts(date: CivilDate): { year: number; month: number; day: number } {
  assertCivilDate(date);
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

export function fromParts(year: number, month: number, day: number): CivilDate {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const { year, month, day } = toParts(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Suma meses recortando el dia al ultimo del mes destino: 31-ene + 1 mes = 28-feb. */
export function addMonths(date: CivilDate, months: number): CivilDate {
  const { year, month, day } = toParts(date);
  const absolute = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absolute / 12);
  const targetMonth = (absolute % 12) + 1;
  const clamped = Math.min(day, daysInMonth(targetYear, targetMonth));
  return fromParts(targetYear, targetMonth, clamped);
}

/** Dias calendario de `from` a `to`. Negativo si `to` ya paso. */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  const a = Date.parse(`${assertCivilDate(from)}T00:00:00Z`);
  const b = Date.parse(`${assertCivilDate(to)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function compareDates(a: CivilDate, b: CivilDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 1 = lunes ... 7 = domingo. */
export function weekday(date: CivilDate): number {
  const { year, month, day } = toParts(date);
  const d = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isMonday(date: CivilDate): boolean {
  return weekday(date) === 1;
}

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function formatDateLong(date: CivilDate): string {
  const { month, day } = toParts(date);
  return `${day} de ${MONTHS_ES[month - 1]}`;
}

export function formatMonth(date: CivilDate): string {
  const { year, month } = toParts(date);
  return `${MONTHS_ES[month - 1]} ${year}`;
}
