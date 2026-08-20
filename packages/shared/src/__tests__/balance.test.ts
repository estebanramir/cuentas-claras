import { describe, expect, it } from 'vitest';
import { BalanceError, computeBalances, simplifyDebts } from '../balance.js';
import { splitAmount } from '../split.js';

const shared = (paidBy: string, amount: bigint, members: string[], rotation = '1') => ({
  paidByMemberId: paidBy,
  amountBaseMinor: amount,
  isShared: true,
  shares: splitAmount({
    amountMinor: amount,
    method: 'EQUAL' as const,
    participants: members.map((memberId) => ({ memberId })),
    rotation,
  }).map((s) => ({ memberId: s.memberId, amountBaseMinor: s.amountMinor })),
});

describe('el caso de la conversacion', () => {
  const memberIds = ['esteban', 'ana'];

  it('yo gaste 50k, ella 100k, yo le debo 25k', () => {
    const balances = computeBalances({
      memberIds,
      expenses: [
        shared('esteban', 50000n, memberIds),
        shared('ana', 100000n, memberIds),
      ],
      settlements: [],
    });

    const esteban = balances.find((b) => b.memberId === 'esteban')!;
    const ana = balances.find((b) => b.memberId === 'ana')!;

    expect(esteban.paidMinor).toBe(50000n);
    expect(esteban.owedMinor).toBe(75000n);
    expect(esteban.balanceMinor).toBe(-25000n);
    expect(ana.balanceMinor).toBe(25000n);

    expect(simplifyDebts(balances)).toEqual([
      { fromMemberId: 'esteban', toMemberId: 'ana', amountMinor: 25000n },
    ]);
  });

  it('saldar la deuda deja todo en cero', () => {
    const balances = computeBalances({
      memberIds,
      expenses: [
        shared('esteban', 50000n, memberIds),
        shared('ana', 100000n, memberIds),
      ],
      settlements: [{ fromMemberId: 'esteban', toMemberId: 'ana', amountBaseMinor: 25000n }],
    });
    expect(balances.every((b) => b.balanceMinor === 0n)).toBe(true);
    expect(simplifyDebts(balances)).toEqual([]);
  });
});

describe('gastos personales', () => {
  it('no mueven el balance de nadie', () => {
    const memberIds = ['a', 'b'];
    const balances = computeBalances({
      memberIds,
      expenses: [
        { paidByMemberId: 'a', amountBaseMinor: 80000n, isShared: false, shares: [{ memberId: 'a', amountBaseMinor: 80000n }] },
        shared('a', 50000n, memberIds),
      ],
      settlements: [],
    });
    expect(balances.find((b) => b.memberId === 'a')!.balanceMinor).toBe(25000n);
    expect(balances.find((b) => b.memberId === 'a')!.paidMinor).toBe(50000n);
  });
});

describe('personas sin cuenta y grupos mas grandes', () => {
  it('nete a tres, incluida una persona sin usuario', () => {
    const memberIds = ['a', 'b', 'invitado'];
    const balances = computeBalances({
      memberIds,
      expenses: [shared('a', 90000n, memberIds), shared('b', 30000n, memberIds)],
      settlements: [],
    });
    expect(balances.reduce((acc, b) => acc + b.balanceMinor, 0n)).toBe(0n);
    const transfers = simplifyDebts(balances);
    expect(transfers.length).toBeLessThanOrEqual(memberIds.length - 1);
    for (const t of transfers) expect(t.amountMinor > 0n).toBe(true);
  });
});

describe('validaciones', () => {
  it('rechaza partes que no suman el gasto', () => {
    expect(() =>
      computeBalances({
        memberIds: ['a', 'b'],
        expenses: [
          {
            paidByMemberId: 'a',
            amountBaseMinor: 100n,
            isShared: true,
            shares: [
              { memberId: 'a', amountBaseMinor: 40n },
              { memberId: 'b', amountBaseMinor: 40n },
            ],
          },
        ],
        settlements: [],
      }),
    ).toThrow(BalanceError);
  });

  it('rechaza miembros ajenos al grupo', () => {
    expect(() =>
      computeBalances({
        memberIds: ['a'],
        expenses: [],
        settlements: [{ fromMemberId: 'a', toMemberId: 'fantasma', amountBaseMinor: 10n }],
      }),
    ).toThrow(BalanceError);
  });
});

describe('invariante: los balances suman cero y la simplificacion los liquida', () => {
  it('resiste grupos y gastos aleatorios', () => {
    let seed = 987;
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % max;
    };

    for (let round = 0; round < 500; round++) {
      const n = 2 + rand(4);
      const memberIds = Array.from({ length: n }, (_, i) => `m${i}`);
      const expenses = Array.from({ length: 1 + rand(8) }, (_, i) =>
        shared(memberIds[rand(n)]!, BigInt(1 + rand(500_000)), memberIds, `${round}-${i}`),
      );
      const balances = computeBalances({ memberIds, expenses, settlements: [] });
      expect(balances.reduce((acc, b) => acc + b.balanceMinor, 0n)).toBe(0n);

      const transfers = simplifyDebts(balances);
      expect(transfers.length).toBeLessThanOrEqual(n - 1);

      // Aplicar las transferencias sugeridas debe dejar a todos en cero.
      const settled = computeBalances({
        memberIds,
        expenses,
        settlements: transfers.map((t) => ({
          fromMemberId: t.fromMemberId,
          toMemberId: t.toMemberId,
          amountBaseMinor: t.amountMinor,
        })),
      });
      expect(settled.every((b) => b.balanceMinor === 0n)).toBe(true);
    }
  });
});
