/**
 * Contratos de la API. Los mismos esquemas validan la entrada en el servidor y
 * los formularios en la app, para que no se puedan desincronizar.
 *
 * Los montos viajan como string: BigInt no es serializable a JSON y un Number
 * pierde precision con montos grandes en pesos.
 */

import { z } from 'zod';
import { CURRENCY_CODES } from './money';

export const minorAmount = z
  .string()
  .regex(/^-?\d+$/, 'el monto debe ser un entero en unidades minimas')
  .transform((v) => BigInt(v));

export const positiveMinorAmount = minorAmount.refine((v) => v > 0n, 'el monto debe ser mayor que cero');

export const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha debe ser YYYY-MM-DD');
export const currencyCode = z.enum(CURRENCY_CODES as [string, ...string[]]);
export const splitMethod = z.enum(['EQUAL', 'PERCENT', 'EXACT', 'SHARES']);
export const recurrence = z.enum(['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']);

export const shareInput = z.object({
  memberId: z.string().min(1),
  weight: z.union([z.number(), z.string()]).optional(),
});

export const createExpenseInput = z
  .object({
    groupId: z.string().min(1),
    description: z.string().min(1).max(140),
    amount: positiveMinorAmount,
    currency: currencyCode,
    fxRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    date: civilDate,
    paidByMemberId: z.string().min(1),
    categoryId: z.string().nullish(),
    isShared: z.boolean().default(true),
    splitMethod: splitMethod.default('EQUAL'),
    shares: z.array(shareInput).min(1),
    notes: z.string().max(500).nullish(),
  })
  .refine((v) => v.isShared || v.shares.length === 1, {
    message: 'un gasto personal solo puede tener un participante',
    path: ['shares'],
  });

export const updateExpenseInput = createExpenseInput.innerType().partial().extend({
  expenseId: z.string().min(1),
});

export const createSettlementInput = z.object({
  groupId: z.string().min(1),
  fromMemberId: z.string().min(1),
  toMemberId: z.string().min(1),
  amount: positiveMinorAmount,
  currency: currencyCode,
  fxRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  date: civilDate,
  note: z.string().max(200).nullish(),
});

export const createGroupInput = z.object({
  name: z.string().min(1).max(60),
  defaultCurrency: currencyCode.default('COP'),
});

export const addMemberInput = z
  .object({
    groupId: z.string().min(1),
    displayName: z.string().min(1).max(60),
    email: z.string().email().nullish(),
  })
  .describe('sin email queda como persona sin cuenta; con email se enlaza cuando entre');

export const createBillInput = z.object({
  groupId: z.string().min(1),
  name: z.string().min(1).max(80),
  categoryId: z.string().nullish(),
  estimatedAmount: positiveMinorAmount,
  currency: currencyCode.default('COP'),
  recurrence,
  anchorDate: civilDate,
  dueDayOfMonth: z.number().int().min(1).max(31).nullish(),
  intervalDays: z.number().int().min(1).max(3650).nullish(),
  reminderDaysBefore: z.array(z.number().int().min(0).max(60)).max(6).default([5, 2, 0]),
  payerMemberId: z.string().min(1),
  splitMethod: splitMethod.default('EQUAL'),
  shares: z.array(shareInput).min(1),
});

export const payBillInstanceInput = z.object({
  paidAmount: positiveMinorAmount,
  currency: currencyCode.optional(),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  date: civilDate,
  paidByMemberId: z.string().min(1).optional(),
});

export const registerDeviceInput = z.object({
  expoPushToken: z.string().min(10),
  platform: z.enum(['android', 'ios']).default('android'),
});

export const googleAuthInput = z.object({ idToken: z.string().min(20) });
export const refreshInput = z.object({ refreshToken: z.string().min(20) });

export type CreateExpenseInput = z.infer<typeof createExpenseInput>;
export type CreateSettlementInput = z.infer<typeof createSettlementInput>;
export type CreateBillInput = z.infer<typeof createBillInput>;
export type PayBillInstanceInput = z.infer<typeof payBillInstanceInput>;
