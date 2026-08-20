import { prisma } from '@cuentas/db';
import { conflict, handler, json, notFound } from '@/lib/http';
import { serializeInstance } from '@/lib/bills';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Saltar un mes sin pagar, para facturas que no siempre llegan. */
export const POST = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { userId } = await requireSession(request);

  const instance = await prisma.billInstance.findUnique({
    where: { id },
    include: { bill: { select: { groupId: true } } },
  });
  if (!instance) throw notFound('Esa factura no existe');
  await requireMembership(userId, instance.bill.groupId);
  if (instance.status === 'PAID') throw conflict('Esa factura ya esta pagada');

  const updated = await prisma.billInstance.update({ where: { id }, data: { status: 'SKIPPED' } });
  return json(serializeInstance(updated));
});
