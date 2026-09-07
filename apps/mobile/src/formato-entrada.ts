/**
 * Formatea el monto mientras la persona escribe: 50000 -> 50.000
 *
 * No se puede resolver con parseAmount + formatAmount porque eso pelea con
 * quien escribe: al teclear "12," en dolares, el monto ya vale 12,00 y el
 * campo saltaria a "12,00" borrando el cursor. Aca el separador decimal a
 * medio escribir sobrevive, y solo se agrupa la parte entera.
 */

import { CURRENCIES, type CurrencyCode } from '@cuentas/shared';

function agrupar(digitos: string): string {
  return digitos.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatearMonto(texto: string, moneda: CurrencyCode): string {
  const exponente = CURRENCIES[moneda].exponent;
  const limpio = texto.replace(/[^\d.,]/g, '');

  if (exponente === 0) {
    return agrupar(limpio.replace(/[.,]/g, ''));
  }

  // Con decimales, el ultimo separador que escribio la persona es el decimal.
  const corte = Math.max(limpio.lastIndexOf(','), limpio.lastIndexOf('.'));
  if (corte === -1) return agrupar(limpio);

  const entero = agrupar(limpio.slice(0, corte).replace(/[.,]/g, ''));
  const decimales = limpio.slice(corte + 1).replace(/[.,]/g, '').slice(0, exponente);
  return `${entero || '0'},${decimales}`;
}

/** Descripcion por defecto cuando la persona no escribe ninguna. */
export function descripcionPorDefecto(fechaLarga: string): string {
  return `Gasto del ${fechaLarga}`;
}
