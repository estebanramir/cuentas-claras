/**
 * Facturas recurrentes: cuando vence la proxima, y que aviso toca hoy.
 *
 * Las ocurrencias se materializan por adelantado (ver `dueDatesWithin`), asi que
 * "que vence este mes" es una consulta y no un calculo de recurrencias en vivo.
 */

import {
  type CivilDate,
  addDays,
  addMonths,
  compareDates,
  daysBetween,
  daysInMonth,
  fromParts,
  toParts,
} from './dates';

export type Recurrence = 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';

export const MONTH_STEP: Record<Exclude<Recurrence, 'CUSTOM'>, number> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  YEARLY: 12,
};

export interface RecurrenceSpec {
  recurrence: Recurrence;
  /** Punto de partida de la serie. */
  anchorDate: CivilDate;
  /** Solo para recurrencias por mes: el dia preferido, recortado si el mes es corto. */
  dueDayOfMonth?: number | null;
  /** Solo para CUSTOM. */
  intervalDays?: number | null;
}

export class BillError extends Error {}

/** Aplica el dia preferido de la factura al mes de `date`, recortando si hace falta. */
export function applyDueDay(date: CivilDate, dueDayOfMonth?: number | null): CivilDate {
  if (dueDayOfMonth == null) return date;
  if (dueDayOfMonth < 1 || dueDayOfMonth > 31) throw new BillError('el dia de vencimiento va de 1 a 31');
  const { year, month } = toParts(date);
  return fromParts(year, month, Math.min(dueDayOfMonth, daysInMonth(year, month)));
}

export function firstDueDate(spec: RecurrenceSpec): CivilDate {
  return spec.recurrence === 'CUSTOM' ? spec.anchorDate : applyDueDay(spec.anchorDate, spec.dueDayOfMonth);
}

export function nextDueDate(spec: RecurrenceSpec, after: CivilDate): CivilDate {
  if (spec.recurrence === 'CUSTOM') {
    const step = spec.intervalDays ?? 0;
    if (step < 1) throw new BillError('el intervalo en dias debe ser al menos 1');
    return addDays(after, step);
  }
  const step = MONTH_STEP[spec.recurrence];
  return applyDueDay(addMonths(after, step), spec.dueDayOfMonth);
}

/**
 * Todas las fechas de vencimiento dentro de una ventana. El cron llama esto a
 * diario con un horizonte de 60 dias y crea las instancias que falten.
 */
export function dueDatesWithin(
  spec: RecurrenceSpec,
  from: CivilDate,
  to: CivilDate,
  limit = 400,
): CivilDate[] {
  if (compareDates(from, to) > 0) throw new BillError('la ventana termina antes de empezar');
  const dates: CivilDate[] = [];
  let current = firstDueDate(spec);
  let guard = 0;

  while (compareDates(current, from) < 0) {
    current = nextDueDate(spec, current);
    if (++guard > limit * 4) throw new BillError('la recurrencia no avanza');
  }
  while (compareDates(current, to) <= 0 && dates.length < limit) {
    dates.push(current);
    current = nextDueDate(spec, current);
  }
  return dates;
}

export type ReminderKind = 'BEFORE' | 'DUE_TODAY' | 'OVERDUE';

export interface ReminderDecision {
  kind: ReminderKind;
  /** Positivo: faltan N dias. Cero: vence hoy. Negativo: lleva N dias vencida. */
  daysUntilDue: number;
}

export const DEFAULT_REMINDER_DAYS = [5, 2, 0];

/**
 * Que aviso corresponde hoy, si es que corresponde alguno.
 * Antes del vencimiento solo avisa en los dias configurados; una vez vencida,
 * insiste todos los dias hasta que se pague.
 */
export function reminderFor(
  dueDate: CivilDate,
  today: CivilDate,
  reminderDaysBefore: number[] = DEFAULT_REMINDER_DAYS,
): ReminderDecision | null {
  const daysUntilDue = daysBetween(today, dueDate);
  if (daysUntilDue < 0) return { kind: 'OVERDUE', daysUntilDue };
  if (daysUntilDue === 0) return { kind: 'DUE_TODAY', daysUntilDue };
  return reminderDaysBefore.includes(daysUntilDue) ? { kind: 'BEFORE', daysUntilDue } : null;
}

/**
 * Estimado de la proxima instancia a partir de lo que se pago antes.
 * Promedia los ultimos pagos; sin historial, deja el estimado de la plantilla.
 */
export function estimateNextAmount(
  recentPaidMinor: bigint[],
  fallbackMinor: bigint,
  sampleSize = 3,
): bigint {
  const sample = recentPaidMinor.slice(0, sampleSize);
  if (sample.length === 0) return fallbackMinor;
  const total = sample.reduce((acc, v) => acc + v, 0n);
  return total / BigInt(sample.length);
}
