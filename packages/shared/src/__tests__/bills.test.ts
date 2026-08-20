import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  isMonday,
  todayInBogota,
  weekday,
} from '../dates';
import {
  BillError,
  DEFAULT_REMINDER_DAYS,
  applyDueDay,
  dueDatesWithin,
  estimateNextAmount,
  nextDueDate,
  reminderFor,
} from '../bills';

describe('aritmetica de fechas', () => {
  it('suma meses recortando al ultimo dia', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('suma dias cruzando meses y anos', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('cuenta dias entre fechas', () => {
    expect(daysBetween('2026-03-10', '2026-03-15')).toBe(5);
    expect(daysBetween('2026-03-15', '2026-03-10')).toBe(-5);
    expect(daysBetween('2026-03-15', '2026-03-15')).toBe(0);
  });

  it('reconoce el lunes', () => {
    expect(weekday('2026-08-17')).toBe(1);
    expect(isMonday('2026-08-17')).toBe(true);
    expect(isMonday('2026-08-19')).toBe(false);
  });

  it('da la fecha de Bogota, no la del servidor', () => {
    // 2026-03-15 a las 02:00 UTC sigue siendo 14 de marzo en Bogota.
    expect(todayInBogota(new Date('2026-03-15T02:00:00Z'))).toBe('2026-03-14');
    expect(todayInBogota(new Date('2026-03-15T12:00:00Z'))).toBe('2026-03-15');
  });
});

describe('recurrencias', () => {
  const luz = { recurrence: 'MONTHLY' as const, anchorDate: '2026-03-15', dueDayOfMonth: 15 };

  it('avanza mes a mes', () => {
    expect(nextDueDate(luz, '2026-03-15')).toBe('2026-04-15');
    expect(nextDueDate(luz, '2026-12-15')).toBe('2027-01-15');
  });

  it('respeta el dia 31 en meses cortos sin perderlo despues', () => {
    const spec = { recurrence: 'MONTHLY' as const, anchorDate: '2026-01-31', dueDayOfMonth: 31 };
    expect(nextDueDate(spec, '2026-01-31')).toBe('2026-02-28');
    expect(nextDueDate(spec, '2026-02-28')).toBe('2026-03-31');
  });

  it('maneja bimestral, trimestral y anual', () => {
    const base = { anchorDate: '2026-01-10', dueDayOfMonth: 10 };
    expect(nextDueDate({ ...base, recurrence: 'BIMONTHLY' }, '2026-01-10')).toBe('2026-03-10');
    expect(nextDueDate({ ...base, recurrence: 'QUARTERLY' }, '2026-01-10')).toBe('2026-04-10');
    expect(nextDueDate({ ...base, recurrence: 'YEARLY' }, '2026-01-10')).toBe('2027-01-10');
  });

  it('maneja intervalos en dias', () => {
    const spec = { recurrence: 'CUSTOM' as const, anchorDate: '2026-01-01', intervalDays: 14 };
    expect(nextDueDate(spec, '2026-01-01')).toBe('2026-01-15');
    expect(() => nextDueDate({ ...spec, intervalDays: 0 }, '2026-01-01')).toThrow(BillError);
  });

  it('recorta el dia preferido al mes', () => {
    expect(applyDueDay('2026-02-01', 31)).toBe('2026-02-28');
    expect(applyDueDay('2026-03-01', 31)).toBe('2026-03-31');
    expect(() => applyDueDay('2026-03-01', 32)).toThrow(BillError);
  });
});

describe('materializacion de instancias', () => {
  it('lista los vencimientos del horizonte', () => {
    const dates = dueDatesWithin(
      { recurrence: 'MONTHLY', anchorDate: '2026-01-15', dueDayOfMonth: 15 },
      '2026-08-19',
      '2026-10-18',
    );
    expect(dates).toEqual(['2026-09-15', '2026-10-15']);
  });

  it('incluye un vencimiento que cae justo en el borde', () => {
    const dates = dueDatesWithin(
      { recurrence: 'MONTHLY', anchorDate: '2026-01-15', dueDayOfMonth: 15 },
      '2026-09-15',
      '2026-09-15',
    );
    expect(dates).toEqual(['2026-09-15']);
  });

  it('no devuelve nada si la ventana no contiene vencimientos', () => {
    const dates = dueDatesWithin(
      { recurrence: 'YEARLY', anchorDate: '2026-01-15', dueDayOfMonth: 15 },
      '2026-03-01',
      '2026-06-01',
    );
    expect(dates).toEqual([]);
  });
});

describe('escalera de recordatorios', () => {
  const due = '2026-03-15';

  it('avisa en los dias configurados', () => {
    expect(reminderFor(due, '2026-03-10', DEFAULT_REMINDER_DAYS)).toEqual({ kind: 'BEFORE', daysUntilDue: 5 });
    expect(reminderFor(due, '2026-03-13', DEFAULT_REMINDER_DAYS)).toEqual({ kind: 'BEFORE', daysUntilDue: 2 });
  });

  it('calla los dias que no tocan', () => {
    expect(reminderFor(due, '2026-03-11', DEFAULT_REMINDER_DAYS)).toBeNull();
    expect(reminderFor(due, '2026-02-01', DEFAULT_REMINDER_DAYS)).toBeNull();
  });

  it('avisa el dia del vencimiento', () => {
    expect(reminderFor(due, due, DEFAULT_REMINDER_DAYS)).toEqual({ kind: 'DUE_TODAY', daysUntilDue: 0 });
  });

  it('insiste todos los dias una vez vencida', () => {
    expect(reminderFor(due, '2026-03-16', DEFAULT_REMINDER_DAYS)).toEqual({ kind: 'OVERDUE', daysUntilDue: -1 });
    expect(reminderFor(due, '2026-03-20', DEFAULT_REMINDER_DAYS)).toEqual({ kind: 'OVERDUE', daysUntilDue: -5 });
  });

  it('respeta una configuracion propia', () => {
    expect(reminderFor(due, '2026-03-05', [7])).toBeNull();
    expect(reminderFor(due, '2026-03-05', [10, 5])).toEqual({ kind: 'BEFORE', daysUntilDue: 10 });
  });
});

describe('estimado que aprende', () => {
  it('promedia los ultimos pagos', () => {
    expect(estimateNextAmount([200000n, 190000n, 180000n], 150000n)).toBe(190000n);
  });

  it('usa solo la muestra pedida', () => {
    expect(estimateNextAmount([300000n, 300000n, 300000n, 1n], 0n, 3)).toBe(300000n);
  });

  it('sin historial deja el estimado de la plantilla', () => {
    expect(estimateNextAmount([], 180000n)).toBe(180000n);
  });
});
