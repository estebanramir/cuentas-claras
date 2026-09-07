/**
 * La app es siempre clara, por decision explicita.
 *
 * Soportar dos temas obliga a verificar cada pantalla dos veces, y en la
 * practica uno de los dos se mantiene peor que el otro. Comprometerse con uno
 * y ejecutarlo bien es mas sobrio que tener ambos a medias.
 *
 * Reglas que sostienen ese aspecto y que conviene no romper:
 *   - separadores de 1px, nunca sombras
 *   - color solo con significado (verde te deben, rojo debes)
 *   - radios de 4 a 8, y solo donde se toca
 *   - las cifras siempre con numerales tabulares
 *
 * Los neutros llevan una desviacion minima hacia el verde del acento: un gris
 * puro se ve accidental, uno con sesgo se ve elegido.
 */

const paleta = {
  fondo: '#F6F7F5',
  superficie: '#FFFFFF',
  superficie2: '#EFF2EF',
  tinta: '#151C19',
  tinta2: '#3E4A45',
  apagado: '#6B7873',
  linea: '#DCE2DE',
  lineaFuerte: '#C4CEC8',
  acento: '#1E5C4C',
  acentoSuave: '#E2EDE8',
  acentoTexto: '#FFFFFF',
  teDeben: '#2C6A46',
  debes: '#8E3A33',
  alerta: '#7E5314',
} as const;

export type Paleta = typeof paleta;

export const espacio = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radio = { sm: 4, md: 6, lg: 8 } as const;

/** El peso hace la jerarquia; el tamaño solo cuando hace falta de verdad. */
export const tipo = {
  cifraGrande: { fontSize: 40, fontWeight: '600' as const, letterSpacing: -0.8 },
  cifra: { fontSize: 17, fontWeight: '600' as const },
  titulo: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.3 },
  cuerpo: { fontSize: 16, fontWeight: '400' as const },
  cuerpoFuerte: { fontSize: 16, fontWeight: '600' as const },
  menor: { fontSize: 14, fontWeight: '400' as const },
  etiqueta: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.6 },
};

/** Sobre esto se apoyan todas las cifras para que las columnas no bailen. */
export const tabular = { fontVariant: ['tabular-nums' as const] };

export const duracion = { rapida: 180, normal: 220 };

export function usePaleta(): Paleta {
  return paleta;
}
