import { prisma } from '@cuentas/db';
import { z } from 'zod';
import { handler, json, notFound, readJson } from '@/lib/http';
import { serializeExpense, updateExpense } from '@/lib/expenses';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const patchInput = z.object({
  description: z.string().min(1).max(140).optional(),
  amount: z.string().regex(/^\d+$/).optional(),
  currency: z.string().optional(),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paidByMemberId: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  isShared: z.boolean().optional(),
  splitMethod: z.enum(['EQUAL', 'PERCENT', 'EXACT', 'SHARES']).optional(),
  shares: z.array(z.object({ memberId: z.string(), weight: z.union([z.number(), z.string()]).optional() })).optional(),
  notes: z.string().max(500).nullable().optional(),
});

async function loadOwned(request: Request, id: string) {
  const { userId } = await requireSession(request);
  const expense = await prisma.expense.findUnique({ where: { id }, include: { shares: true, category: true } });
  if (!expense || expense.deletedAt) throw notFound('Ese gasto ya no existe');
  await requireMembership(userId, expense.groupId);
  return expense;
}

export const GET = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  return json(serializeExpense(await loadOwned(request, id)));
});

export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  await loadOwned(request, id);
  const patch = patchInput.parse(await readJson(request));

  const updated = await updateExpense(id, {
    ...patch,
    amountMinor: patch.amount !== undefined ? BigInt(patch.amount) : undefined,
  });
  return json(serializeExpense(updated));
});

/**
 * Borrado logico. Un gasto que desaparece de verdad deja los balances
 * historicos y los reportes ya vistos sin explicacion.
 */
export const DELETE = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  await loadOwned(request, id);
  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  return json({ deleted: true });
});
