/**
 * Balances de un grupo.
 *
 *   balance(m) = lo que pago  - lo que le tocaba
 *              + lo que abono - lo que le abonaron
 *
 * Positivo: le deben. Negativo: debe.
 * La suma de todos los balances de un grupo es siempre exactamente cero.
 */

export interface BalanceExpense {
  paidByMemberId: string;
  amountBaseMinor: bigint;
  isShared: boolean;
  shares: { memberId: string; amountBaseMinor: bigint }[];
}

export interface BalanceSettlement {
  fromMemberId: string;
  toMemberId: string;
  amountBaseMinor: bigint;
}

export interface BalanceInput {
  memberIds: string[];
  expenses: BalanceExpense[];
  settlements: BalanceSettlement[];
}

export interface MemberBalance {
  memberId: string;
  /** Suma de gastos compartidos que puso de su bolsillo. */
  paidMinor: bigint;
  /** Suma de las partes que le correspondieron. */
  owedMinor: bigint;
  /** Neto, ya incluidos los pagos de saldo. */
  balanceMinor: bigint;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: bigint;
}

export class BalanceError extends Error {}

export function computeBalances(input: BalanceInput): MemberBalance[] {
  const paid = new Map<string, bigint>();
  const owed = new Map<string, bigint>();
  const net = new Map<string, bigint>();
  for (const id of input.memberIds) {
    paid.set(id, 0n);
    owed.set(id, 0n);
    net.set(id, 0n);
  }

  const bump = (map: Map<string, bigint>, id: string, delta: bigint) => {
    if (!map.has(id)) throw new BalanceError(`el miembro ${id} no pertenece al grupo`);
    map.set(id, map.get(id)! + delta);
  };

  for (const expense of input.expenses) {
    if (!expense.isShared) continue;
    const sum = expense.shares.reduce((acc, s) => acc + s.amountBaseMinor, 0n);
    if (sum !== expense.amountBaseMinor) {
      throw new BalanceError(
        `un gasto de ${expense.amountBaseMinor} tiene partes que suman ${sum}`,
      );
    }
    bump(paid, expense.paidByMemberId, expense.amountBaseMinor);
    bump(net, expense.paidByMemberId, expense.amountBaseMinor);
    for (const share of expense.shares) {
      bump(owed, share.memberId, share.amountBaseMinor);
      bump(net, share.memberId, -share.amountBaseMinor);
    }
  }

  for (const settlement of input.settlements) {
    if (settlement.amountBaseMinor < 0n) throw new BalanceError('un abono no puede ser negativo');
    bump(net, settlement.fromMemberId, settlement.amountBaseMinor);
    bump(net, settlement.toMemberId, -settlement.amountBaseMinor);
  }

  const balances = input.memberIds.map((id) => ({
    memberId: id,
    paidMinor: paid.get(id)!,
    owedMinor: owed.get(id)!,
    balanceMinor: net.get(id)!,
  }));

  const total = balances.reduce((acc, b) => acc + b.balanceMinor, 0n);
  if (total !== 0n) throw new BalanceError(`los balances suman ${total} y deberian sumar 0`);

  return balances;
}

/**
 * Quien le transfiere a quien para dejar todo en cero, con la menor cantidad
 * de movimientos: se empareja repetidamente al mayor acreedor con el mayor
 * deudor. Produce a lo sumo N-1 transferencias.
 */
export function simplifyDebts(balances: MemberBalance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.balanceMinor > 0n)
    .map((b) => ({ id: b.memberId, amount: b.balanceMinor }));
  const debtors = balances
    .filter((b) => b.balanceMinor < 0n)
    .map((b) => ({ id: b.memberId, amount: -b.balanceMinor }));

  const byAmountThenId = (a: { id: string; amount: bigint }, b: { id: string; amount: bigint }) =>
    a.amount !== b.amount ? (a.amount > b.amount ? -1 : 1) : a.id < b.id ? -1 : 1;

  creditors.sort(byAmountThenId);
  debtors.sort(byAmountThenId);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const amount = creditor.amount < debtor.amount ? creditor.amount : debtor.amount;
    if (amount > 0n) {
      transfers.push({ fromMemberId: debtor.id, toMemberId: creditor.id, amountMinor: amount });
    }
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0n) ci++;
    if (debtor.amount === 0n) di++;
  }

  return transfers;
}
