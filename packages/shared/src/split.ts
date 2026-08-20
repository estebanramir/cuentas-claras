/**
 * Reparto de un gasto entre participantes.
 *
 * Los cuatro metodos usan el mismo algoritmo: se calcula el ideal de cada uno,
 * se toma el piso, y las unidades sobrantes se asignan por resto mayor.
 * Los empates se rompen rotando segun una semilla derivada del gasto, para que
 * a lo largo de muchos gastos el peso sobrante quede parejo entre miembros.
 *
 * Invariante que se verifica siempre: la suma de las partes es igual al total.
 */

export type SplitMethod = 'EQUAL' | 'PERCENT' | 'EXACT' | 'SHARES';

/** Los pesos se escalan a 6 decimales para admitir porcentajes fraccionarios. */
const WEIGHT_SCALE = 6;
const WEIGHT_UNIT = 10n ** BigInt(WEIGHT_SCALE);
const HUNDRED_PERCENT = 100n * WEIGHT_UNIT;

export interface SplitParticipant {
  memberId: string;
  /** Partes, porcentaje o monto exacto en unidades minimas, segun el metodo. */
  weight?: number | string | bigint;
}

export interface SplitShare {
  memberId: string;
  amountMinor: bigint;
}

export interface SplitOptions {
  amountMinor: bigint;
  method: SplitMethod;
  participants: SplitParticipant[];
  /** Semilla estable del gasto (su id). Rota a quien le toca la unidad sobrante. */
  rotation?: string | number;
}

export class SplitError extends Error {}

export function splitAmount({
  amountMinor,
  method,
  participants,
  rotation = 0,
}: SplitOptions): SplitShare[] {
  if (participants.length === 0) throw new SplitError('el gasto necesita al menos un participante');
  if (amountMinor < 0n) throw new SplitError('el monto no puede ser negativo');

  const ids = participants.map((p) => p.memberId);
  if (new Set(ids).size !== ids.length) throw new SplitError('hay participantes repetidos');

  if (method === 'EXACT') return exactSplit(amountMinor, participants);

  const weights = participants.map((p) => toWeight(method, p));
  if (method === 'PERCENT') {
    const total = weights.reduce((a, b) => a + b, 0n);
    if (total !== HUNDRED_PERCENT) {
      throw new SplitError(`los porcentajes deben sumar 100, suman ${formatWeight(total)}`);
    }
  }

  return largestRemainder(amountMinor, participants, weights, rotation);
}

function exactSplit(amountMinor: bigint, participants: SplitParticipant[]): SplitShare[] {
  const shares = participants.map((p) => {
    const value = p.weight;
    if (value === undefined) throw new SplitError(`falta el monto de ${p.memberId}`);
    const minor = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value)));
    if (minor < 0n) throw new SplitError('los montos exactos no pueden ser negativos');
    return { memberId: p.memberId, amountMinor: minor };
  });
  const sum = shares.reduce((acc, s) => acc + s.amountMinor, 0n);
  if (sum !== amountMinor) {
    throw new SplitError(`los montos suman ${sum} y el gasto es ${amountMinor}`);
  }
  return shares;
}

function largestRemainder(
  amountMinor: bigint,
  participants: SplitParticipant[],
  weights: bigint[],
  rotation: string | number,
): SplitShare[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0n);
  if (totalWeight <= 0n) throw new SplitError('los pesos del reparto deben sumar mas de cero');

  const n = participants.length;
  const floors: bigint[] = [];
  const remainders: bigint[] = [];

  for (let i = 0; i < n; i++) {
    const numerator = amountMinor * weights[i]!;
    floors.push(numerator / totalWeight);
    remainders.push(numerator % totalWeight);
  }

  const assigned = floors.reduce((a, b) => a + b, 0n);
  let leftover = amountMinor - assigned;

  // Orden: resto mayor primero; los empates rotan segun la semilla del gasto.
  const offset = n > 0 ? seedToOffset(rotation, n) : 0;
  const order = floors
    .map((_, i) => i)
    .sort((a, b) => {
      if (remainders[a]! !== remainders[b]!) return remainders[a]! > remainders[b]! ? -1 : 1;
      return rotated(a, offset, n) - rotated(b, offset, n);
    });

  for (const index of order) {
    if (leftover <= 0n) break;
    floors[index] = floors[index]! + 1n;
    leftover -= 1n;
  }

  const shares = participants.map((p, i) => ({ memberId: p.memberId, amountMinor: floors[i]! }));
  assertSums(shares, amountMinor);
  return shares;
}

function toWeight(method: SplitMethod, participant: SplitParticipant): bigint {
  if (method === 'EQUAL') return WEIGHT_UNIT;
  const value = participant.weight;
  if (value === undefined) throw new SplitError(`falta el peso de ${participant.memberId}`);
  const weight = scaleWeight(value);
  if (weight < 0n) throw new SplitError('los pesos no pueden ser negativos');
  return weight;
}

function scaleWeight(value: number | string | bigint): bigint {
  if (typeof value === 'bigint') return value * WEIGHT_UNIT;
  const raw = typeof value === 'number' ? value.toFixed(WEIGHT_SCALE) : value.trim().replace(',', '.');
  if (!/^-?\d*(\.\d+)?$/.test(raw) || raw === '' || raw === '-') {
    throw new SplitError(`peso invalido: ${value}`);
  }
  const negative = raw.startsWith('-');
  const [whole = '0', frac = ''] = raw.replace('-', '').split('.');
  const padded = (frac + '0'.repeat(WEIGHT_SCALE)).slice(0, WEIGHT_SCALE);
  const scaled = BigInt(whole || '0') * WEIGHT_UNIT + BigInt(padded || '0');
  return negative ? -scaled : scaled;
}

function formatWeight(weight: bigint): string {
  const whole = weight / WEIGHT_UNIT;
  const frac = (weight % WEIGHT_UNIT).toString().padStart(WEIGHT_SCALE, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Hash estable y barato: no necesita ser criptografico, solo determinista. */
function seedToOffset(seed: string | number, n: number): number {
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}

function rotated(index: number, offset: number, n: number): number {
  return (index - offset + n) % n;
}

function assertSums(shares: SplitShare[], expected: bigint): void {
  const sum = shares.reduce((acc, s) => acc + s.amountMinor, 0n);
  if (sum !== expected) {
    throw new SplitError(`el reparto sumo ${sum} y deberia sumar ${expected}`);
  }
}
