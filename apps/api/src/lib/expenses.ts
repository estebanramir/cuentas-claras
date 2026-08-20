import { Prisma, prisma } from '@cuentas/db';
import {
  type CivilDate,
  type CurrencyCode,
  type SplitMethod,
  isCurrencyCode,
  parseRate,
  splitAmount,
  toBaseMinor,
} from '@cuentas/shared';
import { badRequest } from './http';
import { manualRate, rateToDecimal, resolveRate, toDbDate } from './fx';

export interface ShareInput {
  memberId: string;
  weight?: number | string;
}

export interface CreateExpenseData {
  groupId: string;
  description: string;
  amountMinor: bigint;
  currency: string;
  fxRate?: string;
  date: CivilDate;
  paidByMemberId: string;
  categoryId?: string | null;
  isShared: boolean;
  splitMethod: SplitMethod;
  shares: ShareInput[];
  notes?: string | null;
  billInstanceId?: string;
}

/**
 * Crea un gasto con su reparto ya resuelto. Es el unico camino por el que entra
 * un gasto al sistema: el formulario de la app y el pago de una factura llaman
 * aca, para que el redondeo y la conversion se hagan igual en los dos casos.
 */
export async function createExpense(userId: string, data: CreateExpenseData) {
  const currency = assertCurrency(data.currency);
  const members = await prisma.member.findMany({
    where: { groupId: data.groupId, removedAt: null },
    select: { id: true, displayName: true },
  });
  const known = new Set(members.map((m) => m.id));

  if (!known.has(data.paidByMemberId)) {
    throw badRequest('Quien pago no es miembro activo del grupo');
  }
  for (const share of data.shares) {
    if (!known.has(share.memberId)) {
      throw badRequest('Hay un participante que no pertenece al grupo');
    }
  }
  if (!data.isShared && data.shares.length !== 1) {
    throw badRequest('Un gasto personal solo puede tener un participante');
  }

  const rate = manualRate(data.fxRate, currency) ?? (await resolveRate(currency, data.date));
  const amountBaseMinor = toBaseMinor(data.amountMinor, currency, rate);

  // El id todavia no existe, asi que la rotacion del sobrante se ancla a algo
  // estable del gasto: mismo gasto, mismo reparto, siempre.
  const rotation = `${data.groupId}:${data.date}:${data.description}:${data.amountMinor}`;
  const shares = splitAmount({
    amountMinor: amountBaseMinor,
    method: data.splitMethod,
    participants: data.shares.map((s) => ({ memberId: s.memberId, weight: s.weight })),
    rotation,
  });

  const weightByMember = new Map(data.shares.map((s) => [s.memberId, s.weight ?? 1]));

  return prisma.expense.create({
    data: {
      groupId: data.groupId,
      categoryId: data.categoryId ?? null,
      description: data.description,
      date: toDbDate(data.date),
      amountMinor: data.amountMinor,
      currency,
      fxRate: rateToDecimal(rate),
      amountBaseMinor,
      paidByMemberId: data.paidByMemberId,
      isShared: data.isShared,
      splitMethod: data.splitMethod,
      billInstanceId: data.billInstanceId ?? null,
      notes: data.notes ?? null,
      createdById: userId,
      shares: {
        create: shares.map((share) => ({
          memberId: share.memberId,
          weight: new Prisma.Decimal(String(weightByMember.get(share.memberId) ?? 1)),
          amountBaseMinor: share.amountMinor,
        })),
      },
    },
    include: { shares: true, category: true, paidBy: true },
  });
}

export function assertCurrency(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) throw badRequest(`Todavia no manejamos la moneda ${value}`);
  return value;
}

/** Forma en que un gasto sale por la API. Los montos van como string. */
export function serializeExpense(expense: {
  id: string;
  description: string;
  date: Date;
  amountMinor: bigint;
  currency: string;
  fxRate: Prisma.Decimal;
  amountBaseMinor: bigint;
  paidByMemberId: string;
  isShared: boolean;
  splitMethod: string;
  categoryId: string | null;
  notes: string | null;
  billInstanceId: string | null;
  shares?: { memberId: string; amountBaseMinor: bigint }[];
  category?: { id: string; name: string; icon: string; color: string } | null;
}) {
  return {
    id: expense.id,
    description: expense.description,
    date: expense.date.toISOString().slice(0, 10),
    amount: expense.amountMinor.toString(),
    currency: expense.currency,
    fxRate: expense.fxRate.toString(),
    amountBase: expense.amountBaseMinor.toString(),
    paidByMemberId: expense.paidByMemberId,
    isShared: expense.isShared,
    splitMethod: expense.splitMethod,
    categoryId: expense.categoryId,
    category: expense.category ?? null,
    notes: expense.notes,
    billInstanceId: expense.billInstanceId,
    shares: expense.shares?.map((s) => ({
      memberId: s.memberId,
      amountBase: s.amountBaseMinor.toString(),
    })),
  };
}

/**
 * Editar un gasto recalcula todo: la conversion, el reparto y el redondeo.
 * Se rehacen las partes en lugar de parchearlas, porque una parte vieja junto a
 * un monto nuevo es exactamente como se rompen los balances.
 */
export async function updateExpense(
  expenseId: string,
  patch: Partial<Omit<CreateExpenseData, 'groupId' | 'billInstanceId'>>,
) {
  const existing = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { shares: true },
  });
  if (!existing || existing.deletedAt) throw badRequest('Ese gasto ya no existe');

  const merged: CreateExpenseData = {
    groupId: existing.groupId,
    description: patch.description ?? existing.description,
    amountMinor: patch.amountMinor ?? existing.amountMinor,
    currency: patch.currency ?? existing.currency,
    fxRate: patch.fxRate,
    date: patch.date ?? (existing.date.toISOString().slice(0, 10) as CivilDate),
    paidByMemberId: patch.paidByMemberId ?? existing.paidByMemberId,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : existing.categoryId,
    isShared: patch.isShared ?? existing.isShared,
    splitMethod: patch.splitMethod ?? (existing.splitMethod as SplitMethod),
    shares:
      patch.shares ??
      existing.shares.map((s) => ({ memberId: s.memberId, weight: s.weight.toNumber() })),
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
  };

  const currency = assertCurrency(merged.currency);
  const keepRate = patch.fxRate === undefined && patch.currency === undefined && patch.date === undefined;
  const rate = keepRate
    ? parseRate(existing.fxRate.toString())
    : (manualRate(merged.fxRate, currency) ?? (await resolveRate(currency, merged.date)));

  const amountBaseMinor = toBaseMinor(merged.amountMinor, currency, rate);
  const shares = splitAmount({
    amountMinor: amountBaseMinor,
    method: merged.splitMethod,
    participants: merged.shares.map((s) => ({ memberId: s.memberId, weight: s.weight })),
    rotation: expenseId,
  });
  const weightByMember = new Map(merged.shares.map((s) => [s.memberId, s.weight ?? 1]));

  return prisma.$transaction(async (tx) => {
    await tx.expenseShare.deleteMany({ where: { expenseId } });
    return tx.expense.update({
      where: { id: expenseId },
      data: {
        description: merged.description,
        date: toDbDate(merged.date),
        amountMinor: merged.amountMinor,
        currency,
        fxRate: rateToDecimal(rate),
        amountBaseMinor,
        paidByMemberId: merged.paidByMemberId,
        categoryId: merged.categoryId ?? null,
        isShared: merged.isShared,
        splitMethod: merged.splitMethod,
        notes: merged.notes ?? null,
        shares: {
          create: shares.map((share) => ({
            memberId: share.memberId,
            weight: new Prisma.Decimal(String(weightByMember.get(share.memberId) ?? 1)),
            amountBaseMinor: share.amountMinor,
          })),
        },
      },
      include: { shares: true, category: true, paidBy: true },
    });
  });
}
