import { prisma } from '@cuentas/db';
import { schemas } from '@cuentas/shared';
import { badRequest, handler, json, readJson } from '@/lib/http';
import { createExpense, serializeExpense } from '@/lib/expenses';
import { toDbDate } from '@/lib/fx';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request) => {
  const { userId } = await requireSession(request);
  const url = new URL(request.url);
  const groupId = url.searchParams.get('groupId');
  if (!groupId) throw badRequest('Falta indicar el grupo');
  await requireMembership(userId, groupId);

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const categoryId = url.searchParams.get('categoryId');
  const shared = url.searchParams.get('shared');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 300);

  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      deletedAt: null,
      ...(categoryId ? { categoryId } : {}),
      ...(shared === 'true' ? { isShared: true } : shared === 'false' ? { isShared: false } : {}),
      ...(from || to
        ? { date: { ...(from ? { gte: toDbDate(from) } : {}), ...(to ? { lte: toDbDate(to) } : {}) } }
        : {}),
    },
    include: { shares: true, category: true },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });

  return json(expenses.map(serializeExpense));
});

export const POST = handler(async (request) => {
  const { userId } = await requireSession(request);
  const input = schemas.createExpenseInput.parse(await readJson(request));
  await requireMembership(userId, input.groupId);

  const expense = await createExpense(userId, {
    groupId: input.groupId,
    description: input.description,
    amountMinor: input.amount,
    currency: input.currency,
    fxRate: input.fxRate,
    date: input.date,
    paidByMemberId: input.paidByMemberId,
    categoryId: input.categoryId ?? null,
    isShared: input.isShared,
    splitMethod: input.splitMethod,
    shares: input.shares,
    notes: input.notes ?? null,
  });

  return json(serializeExpense(expense), { status: 201 });
});
