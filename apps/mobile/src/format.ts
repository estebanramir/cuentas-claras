import { type CurrencyCode, formatAmount, formatDateLong, todayInBogota } from '@cuentas/shared';

/** Los montos llegan de la API como string; aca se vuelven texto para mostrar. */
export function plata(minor: string | bigint, moneda: CurrencyCode = 'COP', signed = false): string {
  const valor = typeof minor === 'string' ? BigInt(minor) : minor;
  return formatAmount(valor, moneda, { signed });
}

export function fechaCorta(iso: string): string {
  const hoy = todayInBogota();
  if (iso === hoy) return 'Hoy';
  const ayer = new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (iso === ayer) return 'Ayer';
  return formatDateLong(iso);
}

/** "en 5 dias", "hoy", "hace 3 dias" — el texto que va en la lista de facturas. */
export function cuandoVence(dias: number): string {
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  if (dias > 1) return `vence en ${dias} dias`;
  if (dias === -1) return 'vencio ayer';
  return `vencio hace ${Math.abs(dias)} dias`;
}

export function hoy(): string {
  return todayInBogota();
}
