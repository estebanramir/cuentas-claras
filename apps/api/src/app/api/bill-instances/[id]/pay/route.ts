import { prisma } from '@cuentas/db';
import { schemas } from '@cuentas/shared';
import { handler, json, notFound, readJson } from '@/lib/http';
import { payInstance, serializeInstance } from '@/lib/bills';
import { serializeExpense } from '@/lib/expenses';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Marcar pagada. Aca es donde la factura se convierte en un gasto real del
 * grupo y los balances se mueven solos.
 */
export const POST = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { userId } = await requireSession(request);

  const instance = await prisma.billInstance.findUnique({
    where: { id },
    include: { bill: { select: { groupId: true } } },
  });
  if (!instance) throw notFound('Esa factura no existe');
  await requireMembership(userId, instance.bill.groupId);

  const input = schemas.payBillInstanceInput.parse(await readJson(request));
  const result = await payInstance(userId, id, {
    paidAmountMinor: input.paidAmount,
    currency: input.currency,
    fxRate: input.fxRate,
    date: input.date,
    paidByMemberId: input.paidByMemberId,
  });

  return json({
    instance: serializeInstance(result.instance),
    expense: serializeExpense(result.expense),
  });
});
