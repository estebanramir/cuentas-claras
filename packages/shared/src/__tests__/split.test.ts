import { describe, expect, it } from 'vitest';
import { SplitError, splitAmount } from '../split';

const sum = (shares: { amountMinor: bigint }[]) => shares.reduce((a, s) => a + s.amountMinor, 0n);

describe('reparto en partes iguales', () => {
  it('divide exacto cuando cabe', () => {
    const shares = splitAmount({
      amountMinor: 150000n,
      method: 'EQUAL',
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    expect(shares.map((s) => s.amountMinor)).toEqual([75000n, 75000n]);
  });

  it('reparte la unidad sobrante sin perderla', () => {
    const shares = splitAmount({
      amountMinor: 51311n,
      method: 'EQUAL',
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
      rotation: 'gasto-1',
    });
    expect(sum(shares)).toBe(51311n);
    expect(shares.map((s) => s.amountMinor).sort()).toEqual([25655n, 25656n]);
  });

  it('rota a quien le toca el sobrante segun el gasto', () => {
    const quien = (rotation: string) =>
      splitAmount({
        amountMinor: 101n,
        method: 'EQUAL',
        participants: [{ memberId: 'a' }, { memberId: 'b' }],
        rotation,
      }).find((s) => s.amountMinor === 51n)!.memberId;

    const resultados = new Set(
      Array.from({ length: 40 }, (_, i) => quien(`gasto-${i}`)),
    );
    expect(resultados).toEqual(new Set(['a', 'b']));
  });

  it('es determinista para el mismo gasto', () => {
    const run = () =>
      splitAmount({
        amountMinor: 100n,
        method: 'EQUAL',
        participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
        rotation: 'estable',
      });
    expect(run()).toEqual(run());
  });
});

describe('otros metodos', () => {
  it('reparte por porcentaje', () => {
    const shares = splitAmount({
      amountMinor: 100000n,
      method: 'PERCENT',
      participants: [
        { memberId: 'a', weight: 70 },
        { memberId: 'b', weight: 30 },
      ],
    });
    expect(shares.map((s) => s.amountMinor)).toEqual([70000n, 30000n]);
  });

  it('admite porcentajes fraccionarios que suman 100', () => {
    const shares = splitAmount({
      amountMinor: 100000n,
      method: 'PERCENT',
      participants: [
        { memberId: 'a', weight: '33.33' },
        { memberId: 'b', weight: '33.33' },
        { memberId: 'c', weight: '33.34' },
      ],
    });
    expect(sum(shares)).toBe(100000n);
  });

  it('rechaza porcentajes que no suman 100', () => {
    expect(() =>
      splitAmount({
        amountMinor: 100000n,
        method: 'PERCENT',
        participants: [
          { memberId: 'a', weight: 60 },
          { memberId: 'b', weight: 30 },
        ],
      }),
    ).toThrow(SplitError);
  });

  it('reparte por partes', () => {
    const shares = splitAmount({
      amountMinor: 90000n,
      method: 'SHARES',
      participants: [
        { memberId: 'a', weight: 2 },
        { memberId: 'b', weight: 1 },
      ],
    });
    expect(shares.map((s) => s.amountMinor)).toEqual([60000n, 30000n]);
  });

  it('acepta montos exactos que cuadran', () => {
    const shares = splitAmount({
      amountMinor: 50000n,
      method: 'EXACT',
      participants: [
        { memberId: 'a', weight: 30000n },
        { memberId: 'b', weight: 20000n },
      ],
    });
    expect(shares.map((s) => s.amountMinor)).toEqual([30000n, 20000n]);
  });

  it('rechaza montos exactos que no cuadran', () => {
    expect(() =>
      splitAmount({
        amountMinor: 50000n,
        method: 'EXACT',
        participants: [
          { memberId: 'a', weight: 30000n },
          { memberId: 'b', weight: 10000n },
        ],
      }),
    ).toThrow(SplitError);
  });
});

describe('validaciones', () => {
  it('exige participantes', () => {
    expect(() => splitAmount({ amountMinor: 1000n, method: 'EQUAL', participants: [] })).toThrow(SplitError);
  });

  it('rechaza participantes repetidos', () => {
    expect(() =>
      splitAmount({
        amountMinor: 1000n,
        method: 'EQUAL',
        participants: [{ memberId: 'a' }, { memberId: 'a' }],
      }),
    ).toThrow(SplitError);
  });
});

describe('invariante: las partes siempre suman el total', () => {
  it('resiste montos y pesos aleatorios', () => {
    let seed = 12345;
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % max;
    };

    for (let round = 0; round < 3000; round++) {
      const n = 2 + rand(5);
      const amount = BigInt(1 + rand(9_999_999));
      const participants = Array.from({ length: n }, (_, i) => ({
        memberId: `m${i}`,
        weight: 1 + rand(20),
      }));
      const equal = splitAmount({ amountMinor: amount, method: 'EQUAL', participants, rotation: round });
      const shares = splitAmount({ amountMinor: amount, method: 'SHARES', participants, rotation: round });
      expect(sum(equal)).toBe(amount);
      expect(sum(shares)).toBe(amount);
      for (const s of [...equal, ...shares]) expect(s.amountMinor >= 0n).toBe(true);
    }
  });
});
