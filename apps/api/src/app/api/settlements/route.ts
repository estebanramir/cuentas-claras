import { prisma } from '@cuentas/db';
import { schemas, toBaseMinor } from '@cuentas/shared';
import { badRequest, handler, json, readJson } from '@/lib/http';
import { assertCurrency } from '@/lib/expenses';
import { manualRate, rateToDecimal, resolveRate, toDbDate } from '@/lib/fx';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request) => {
  const { userId } = await requireSession(request);
  const groupId = new URL(request.url).searchParams.get('groupId');
  if (!groupId) throw badRequest('Falta indicar el grupo');
  await requireMembership(userId, groupId);

  const settlements = await prisma.settlement.findMany({
    where: { groupId },
    include: { from: true, to: true },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });

  return json(
    settlements.map((s) => ({
      id: s.id,
      date: s.date.toISOString().slice(0, 10),
      fromMemberId: s.fromMemberId,
      fromName: s.from.displayName,
      toMemberId: s.toMemberId,
      toName: s.to.displayName,
      amount: s.amountMinor.toString(),
      amountBase: s.amountBaseMinor.toString(),
      currency: s.currency,
      note: s.note,
    })),
  );
});

/** Saldar una deuda: no borra gastos, agrega un abono que lleva el neto a cero. */
export const POST = handler(async (request) => {
  const { userId } = await requireSession(request);
  const input = schemas.createSettlementInput.parse(await readJson(request));
  await requireMembership(userId, input.groupId);

  if (input.fromMemberId === input.toMemberId) {
    throw badRequest('No puedes registrar un pago de alguien a si mismo');
  }

  const members = await prisma.member.findMany({
    where: { groupId: input.groupId, removedAt: null, id: { in: [input.fromMemberId, input.toMemberId] } },
    select: { id: true },
  });
  if (members.length !== 2) throw badRequest('Alguna de las dos personas no esta en el grupo');

  const currency = assertCurrency(input.currency);
  const rate = manualRate(input.fxRate, currency) ?? (await resolveRate(currency, input.date));
  const amountBaseMinor = toBaseMinor(input.amount, currency, rate);

  const settlement = await prisma.settlement.create({
    data: {
      groupId: input.groupId,
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
      date: toDbDate(input.date),
      amountMinor: input.amount,
      currency,
      fxRate: rateToDecimal(rate),
      amountBaseMinor,
      note: input.note ?? null,
    },
  });

  return json({ id: settlement.id, amountBase: amountBaseMinor.toString() }, { status: 201 });
});
