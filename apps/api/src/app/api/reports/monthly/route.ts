import { prisma } from '@cuentas/db';
import { addDays, addMonths, formatAmount, formatMonth, todayInBogota } from '@cuentas/shared';
import { badRequest, handler, json } from '@/lib/http';
import { toDbDate } from '@/lib/fx';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Bucket {
  categoryId: string | null;
  name: string;
  icon: string;
  totalMinor: bigint;
  count: number;
}

/**
 * En que se fue la plata este mes, comparado con el anterior.
 *
 * "Compartido" son los gastos del grupo; "personal" es lo que registro quien
 * consulta y no entra en los balances de nadie mas. Se reportan por separado
 * porque mezclarlos hace que el numero no signifique nada.
 */
export const GET = handler(async (request) => {
  const { userId } = await requireSession(request);
  const url = new URL(request.url);
  const groupId = url.searchParams.get('groupId');
  if (!groupId) throw badRequest('Falta indicar el grupo');
  const me = await requireMembership(userId, groupId);

  const month = url.searchParams.get('month') ?? todayInBogota().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('El mes debe ser YYYY-MM');

  const current = await monthTotals(groupId, me.id, month);
  const previous = await monthTotals(groupId, me.id, addMonths(`${month}-01`, -1).slice(0, 7));

  return json({
    month,
    label: formatMonth(`${month}-01`),
    shared: summary(current.shared, previous.sharedTotal),
    personal: summary(current.personal, previous.personalTotal),
    categories: current.categories
      .sort((a, b) => (a.totalMinor > b.totalMinor ? -1 : 1))
      .map((bucket) => ({
        categoryId: bucket.categoryId,
        name: bucket.name,
        icon: bucket.icon,
        total: bucket.totalMinor.toString(),
        totalLabel: formatAmount(bucket.totalMinor, 'COP'),
        count: bucket.count,
        share: percentOf(bucket.totalMinor, current.sharedTotal + current.personalTotal),
      })),
    previousMonth: {
      shared: current.sharedTotal.toString(),
      label: formatMonth(addMonths(`${month}-01`, -1)),
    },
  });
});

function summary(total: bigint, previousTotal: bigint) {
  const delta = total - previousTotal;
  return {
    total: total.toString(),
    totalLabel: formatAmount(total, 'COP'),
    delta: delta.toString(),
    deltaLabel: formatAmount(delta, 'COP', { signed: true }),
    /** Null cuando el mes anterior fue cero: un porcentaje ahi no dice nada. */
    deltaPercent: previousTotal === 0n ? null : percentOf(delta, previousTotal),
  };
}

function percentOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Math.round(Number((part * 1000n) / whole)) / 10;
}

async function monthTotals(groupId: string, memberId: string, month: string) {
  const from = `${month}-01`;
  const to = addDays(addMonths(from, 1), -1);

  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      deletedAt: null,
      date: { gte: toDbDate(from), lte: toDbDate(to) },
      OR: [{ isShared: true }, { isShared: false, paidByMemberId: memberId }],
    },
    include: { category: { select: { id: true, name: true, icon: true } } },
  });

  const buckets = new Map<string, Bucket>();
  let sharedTotal = 0n;
  let personalTotal = 0n;

  for (const expense of expenses) {
    if (expense.isShared) sharedTotal += expense.amountBaseMinor;
    else personalTotal += expense.amountBaseMinor;

    const key = expense.categoryId ?? 'sin-categoria';
    const bucket = buckets.get(key) ?? {
      categoryId: expense.categoryId,
      name: expense.category?.name ?? 'Sin categoria',
      icon: expense.category?.icon ?? 'receipt',
      totalMinor: 0n,
      count: 0,
    };
    bucket.totalMinor += expense.amountBaseMinor;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return {
    shared: sharedTotal,
    personal: personalTotal,
    sharedTotal,
    personalTotal,
    categories: [...buckets.values()],
  };
}
