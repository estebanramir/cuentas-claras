import { prisma } from '@cuentas/db';
import { computeBalances, formatAmount, simplifyDebts } from '@cuentas/shared';

/**
 * Carga lo del grupo y delega el calculo a @cuentas/shared, que es la misma
 * funcion que la app usa para pintar el resultado antes de que llegue la
 * respuesta. Una sola definicion de "cuanto debo".
 */
export async function groupBalances(groupId: string) {
  const [members, expenses, settlements] = await Promise.all([
    prisma.member.findMany({
      where: { groupId, removedAt: null },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, displayName: true, userId: true },
    }),
    prisma.expense.findMany({
      where: { groupId, deletedAt: null, isShared: true },
      select: {
        paidByMemberId: true,
        amountBaseMinor: true,
        isShared: true,
        shares: { select: { memberId: true, amountBaseMinor: true } },
      },
    }),
    prisma.settlement.findMany({
      where: { groupId },
      select: { fromMemberId: true, toMemberId: true, amountBaseMinor: true },
    }),
  ]);

  const memberIds = members.map((m) => m.id);
  const balances = computeBalances({
    memberIds,
    expenses: expenses.map((e) => ({
      paidByMemberId: e.paidByMemberId,
      amountBaseMinor: e.amountBaseMinor,
      isShared: e.isShared,
      shares: e.shares,
    })),
    settlements: settlements.map((s) => ({
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amountBaseMinor: s.amountBaseMinor,
    })),
  });

  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));
  const transfers = simplifyDebts(balances);

  return {
    members: members.map((member) => {
      const balance = balances.find((b) => b.memberId === member.id)!;
      return {
        memberId: member.id,
        displayName: member.displayName,
        userId: member.userId,
        paid: balance.paidMinor.toString(),
        owed: balance.owedMinor.toString(),
        balance: balance.balanceMinor.toString(),
        balanceLabel: formatAmount(balance.balanceMinor, 'COP', { signed: true }),
      };
    }),
    transfers: transfers.map((transfer) => ({
      fromMemberId: transfer.fromMemberId,
      fromName: nameOf.get(transfer.fromMemberId) ?? '',
      toMemberId: transfer.toMemberId,
      toName: nameOf.get(transfer.toMemberId) ?? '',
      amount: transfer.amountMinor.toString(),
      amountLabel: formatAmount(transfer.amountMinor, 'COP'),
      /** Frase lista para mostrar, para que la app no arme texto con montos. */
      summary: `${nameOf.get(transfer.fromMemberId) ?? ''} le debe ${formatAmount(
        transfer.amountMinor,
        'COP',
      )} a ${nameOf.get(transfer.toMemberId) ?? ''}`,
    })),
  };
}
