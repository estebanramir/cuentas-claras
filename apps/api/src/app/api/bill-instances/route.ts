import { prisma } from '@cuentas/db';
import { addDays, todayInBogota } from '@cuentas/shared';
import { badRequest, handler, json } from '@/lib/http';
import { serializeInstance } from '@/lib/bills';
import { toDbDate } from '@/lib/fx';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Lo que vence, por defecto los proximos 45 dias mas lo que quedo atrasado. */
export const GET = handler(async (request) => {
  const { userId } = await requireSession(request);
  const url = new URL(request.url);
  const groupId = url.searchParams.get('groupId');
  if (!groupId) throw badRequest('Falta indicar el grupo');
  await requireMembership(userId, groupId);

  const today = todayInBogota();
  const from = url.searchParams.get('from') ?? addDays(today, -90);
  const to = url.searchParams.get('to') ?? addDays(today, 45);
  const status = url.searchParams.get('status');

  const instances = await prisma.billInstance.findMany({
    where: {
      bill: { groupId },
      dueDate: { gte: toDbDate(from), lte: toDbDate(to) },
      ...(status ? { status: status as 'PENDING' | 'PAID' | 'SKIPPED' } : {}),
    },
    include: { bill: { select: { id: true, name: true, currency: true, groupId: true, payerMemberId: true } } },
    orderBy: { dueDate: 'asc' },
  });

  return json(
    instances.map((instance) => ({
      ...serializeInstance(instance),
      /** Negativo significa vencida hace tantos dias. */
      daysUntilDue: Math.round(
        (Date.parse(`${instance.dueDate.toISOString().slice(0, 10)}T00:00:00Z`) -
          Date.parse(`${today}T00:00:00Z`)) /
          86_400_000,
      ),
    })),
  );
});
