import { Prisma, prisma } from '@cuentas/db';
import { schemas } from '@cuentas/shared';
import { badRequest, handler, json, readJson } from '@/lib/http';
import { materializeInstances } from '@/lib/bills';
import { toDbDate } from '@/lib/fx';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request) => {
  const { userId } = await requireSession(request);
  const groupId = new URL(request.url).searchParams.get('groupId');
  if (!groupId) throw badRequest('Falta indicar el grupo');
  await requireMembership(userId, groupId);

  const bills = await prisma.bill.findMany({
    where: { groupId },
    include: {
      category: true,
      shares: true,
      instances: {
        where: { status: 'PENDING' },
        orderBy: { dueDate: 'asc' },
        take: 1,
      },
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return json(
    bills.map((bill) => ({
      id: bill.id,
      name: bill.name,
      estimatedAmount: bill.estimatedAmountMinor.toString(),
      currency: bill.currency,
      recurrence: bill.recurrence,
      dueDayOfMonth: bill.dueDayOfMonth,
      intervalDays: bill.intervalDays,
      reminderDaysBefore: bill.reminderDaysBefore,
      payerMemberId: bill.payerMemberId,
      splitMethod: bill.splitMethod,
      isActive: bill.isActive,
      category: bill.category ? { id: bill.category.id, name: bill.category.name } : null,
      shares: bill.shares.map((s) => ({ memberId: s.memberId, weight: s.weight.toString() })),
      next: bill.instances[0]
        ? {
            id: bill.instances[0].id,
            dueDate: bill.instances[0].dueDate.toISOString().slice(0, 10),
            expectedAmount: bill.instances[0].expectedAmountMinor.toString(),
          }
        : null,
    })),
  );
});

export const POST = handler(async (request) => {
  const { userId } = await requireSession(request);
  const input = schemas.createBillInput.parse(await readJson(request));
  await requireMembership(userId, input.groupId);

  if (input.recurrence === 'CUSTOM' && !input.intervalDays) {
    throw badRequest('Una factura con intervalo propio necesita cada cuantos dias se repite');
  }
  if (input.recurrence !== 'CUSTOM' && !input.dueDayOfMonth) {
    throw badRequest('Falta el dia del mes en que vence');
  }

  const memberIds = new Set(
    (
      await prisma.member.findMany({
        where: { groupId: input.groupId, removedAt: null },
        select: { id: true },
      })
    ).map((m) => m.id),
  );
  if (!memberIds.has(input.payerMemberId)) throw badRequest('Quien paga no esta en el grupo');
  for (const share of input.shares) {
    if (!memberIds.has(share.memberId)) throw badRequest('Hay un participante que no esta en el grupo');
  }

  const bill = await prisma.bill.create({
    data: {
      groupId: input.groupId,
      name: input.name,
      categoryId: input.categoryId ?? null,
      estimatedAmountMinor: input.estimatedAmount,
      currency: input.currency,
      recurrence: input.recurrence,
      anchorDate: toDbDate(input.anchorDate),
      dueDayOfMonth: input.dueDayOfMonth ?? null,
      intervalDays: input.intervalDays ?? null,
      reminderDaysBefore: input.reminderDaysBefore,
      payerMemberId: input.payerMemberId,
      splitMethod: input.splitMethod,
      shares: {
        create: input.shares.map((share) => ({
          memberId: share.memberId,
          weight: new Prisma.Decimal(String(share.weight ?? 1)),
        })),
      },
    },
  });

  // Se materializan de una vez para que la factura aparezca en "proximas" sin
  // tener que esperar a que corra el cron manana.
  await materializeInstances({ groupId: input.groupId });

  return json({ id: bill.id, name: bill.name }, { status: 201 });
});
