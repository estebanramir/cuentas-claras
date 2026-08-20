import { prisma } from '@cuentas/db';
import {
  type CivilDate,
  addDays,
  dueDatesWithin,
  estimateNextAmount,
  todayInBogota,
} from '@cuentas/shared';
import { badRequest, conflict, notFound } from './http';
import { assertCurrency, createExpense } from './expenses';
import { fromDbDate, toDbDate } from './fx';

const HORIZON_DAYS = 60;
const ESTIMATE_SAMPLE = 3;

/**
 * Crea las instancias que falten dentro del horizonte. Es idempotente: el
 * indice unico (billId, dueDate) hace que correrlo dos veces el mismo dia no
 * duplique nada, asi que el cron puede reintentar sin miedo.
 */
export async function materializeInstances(
  options: { groupId?: string; today?: CivilDate; horizonDays?: number } = {},
): Promise<number> {
  const today = options.today ?? todayInBogota();
  const horizon = addDays(today, options.horizonDays ?? HORIZON_DAYS);

  const bills = await prisma.bill.findMany({
    where: { isActive: true, ...(options.groupId ? { groupId: options.groupId } : {}) },
    include: {
      instances: {
        where: { status: 'PAID' },
        orderBy: { dueDate: 'desc' },
        take: ESTIMATE_SAMPLE,
        select: { paidAmountMinor: true },
      },
    },
  });

  let created = 0;
  for (const bill of bills) {
    const dates = dueDatesWithin(
      {
        recurrence: bill.recurrence,
        anchorDate: fromDbDate(bill.anchorDate),
        dueDayOfMonth: bill.dueDayOfMonth,
        intervalDays: bill.intervalDays,
      },
      today,
      horizon,
    );

    const paid = bill.instances
      .map((i) => i.paidAmountMinor)
      .filter((v): v is bigint => v !== null);
    const expected = estimateNextAmount(paid, bill.estimatedAmountMinor, ESTIMATE_SAMPLE);

    for (const dueDate of dates) {
      const result = await prisma.billInstance.createMany({
        data: [{ billId: bill.id, dueDate: toDbDate(dueDate), expectedAmountMinor: expected }],
        skipDuplicates: true,
      });
      created += result.count;
    }
  }
  return created;
}

export interface PayInstanceData {
  paidAmountMinor: bigint;
  currency?: string;
  fxRate?: string;
  date: CivilDate;
  paidByMemberId?: string;
}

/**
 * Marca la factura como pagada y genera el gasto del grupo, heredando el
 * pagador y el reparto de la plantilla. Es el punto donde las dos mitades de
 * la app se tocan: pagar la luz mueve los balances sin escribir nada dos veces.
 */
export async function payInstance(userId: string, instanceId: string, data: PayInstanceData) {
  const instance = await prisma.billInstance.findUnique({
    where: { id: instanceId },
    include: { bill: { include: { shares: true } }, expense: true },
  });
  if (!instance) throw notFound('Esa factura no existe');
  if (instance.status === 'PAID') throw conflict('Esa factura ya estaba marcada como pagada');

  const bill = instance.bill;
  const currency = assertCurrency(data.currency ?? bill.currency);
  const shares =
    bill.shares.length > 0
      ? bill.shares.map((share) => ({ memberId: share.memberId, weight: share.weight.toNumber() }))
      : await defaultShares(bill.groupId);

  if (shares.length === 0) throw badRequest('La factura no tiene a quien repartirle');

  const expense = await createExpense(userId, {
    groupId: bill.groupId,
    description: bill.name,
    amountMinor: data.paidAmountMinor,
    currency,
    fxRate: data.fxRate,
    date: data.date,
    paidByMemberId: data.paidByMemberId ?? bill.payerMemberId,
    categoryId: bill.categoryId,
    isShared: true,
    splitMethod: bill.splitMethod,
    shares,
    billInstanceId: instance.id,
  });

  const updated = await prisma.billInstance.update({
    where: { id: instance.id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      paidAmountMinor: data.paidAmountMinor,
      paidCurrency: currency,
    },
  });

  // El monto real alimenta el estimado de las instancias futuras sin pagar.
  await refreshFutureEstimates(bill.id);

  return { instance: updated, expense };
}

async function defaultShares(groupId: string) {
  const members = await prisma.member.findMany({
    where: { groupId, removedAt: null },
    select: { id: true },
  });
  return members.map((member) => ({ memberId: member.id, weight: 1 }));
}

async function refreshFutureEstimates(billId: string): Promise<void> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    select: { estimatedAmountMinor: true },
  });
  if (!bill) return;

  const paidRows = await prisma.billInstance.findMany({
    where: { billId, status: 'PAID', paidAmountMinor: { not: null } },
    orderBy: { dueDate: 'desc' },
    take: ESTIMATE_SAMPLE,
    select: { paidAmountMinor: true },
  });
  const paid = paidRows.map((r) => r.paidAmountMinor).filter((v): v is bigint => v !== null);
  const expected = estimateNextAmount(paid, bill.estimatedAmountMinor, ESTIMATE_SAMPLE);

  await prisma.billInstance.updateMany({
    where: { billId, status: 'PENDING' },
    data: { expectedAmountMinor: expected },
  });
}

export function serializeInstance(instance: {
  id: string;
  dueDate: Date;
  expectedAmountMinor: bigint;
  status: string;
  paidAt: Date | null;
  paidAmountMinor: bigint | null;
  paidCurrency: string | null;
  bill?: { id: string; name: string; currency: string; groupId: string; payerMemberId: string } | null;
}) {
  return {
    id: instance.id,
    dueDate: fromDbDate(instance.dueDate),
    expectedAmount: instance.expectedAmountMinor.toString(),
    status: instance.status,
    paidAt: instance.paidAt?.toISOString() ?? null,
    paidAmount: instance.paidAmountMinor?.toString() ?? null,
    paidCurrency: instance.paidCurrency,
    bill: instance.bill
      ? {
          id: instance.bill.id,
          name: instance.bill.name,
          currency: instance.bill.currency,
          groupId: instance.bill.groupId,
          payerMemberId: instance.bill.payerMemberId,
        }
      : null,
  };
}
