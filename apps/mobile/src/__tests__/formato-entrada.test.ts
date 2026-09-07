import { describe, expect, it } from 'vitest';
import { descripcionPorDefecto, formatearMonto } from '../formato-entrada';

describe('formateo mientras se escribe, en pesos', () => {
  it('agrupa miles y millones', () => {
    expect(formatearMonto('50000', 'COP')).toBe('50.000');
    expect(formatearMonto('1500000', 'COP')).toBe('1.500.000');
    expect(formatearMonto('12', 'COP')).toBe('12');
    expect(formatearMonto('1234567890', 'COP')).toBe('1.234.567.890');
  });

  it('es estable al reformatear lo ya formateado', () => {
    expect(formatearMonto('50.000', 'COP')).toBe('50.000');
    expect(formatearMonto(formatearMonto('1500000', 'COP'), 'COP')).toBe('1.500.000');
  });

  it('ignora lo que no sean digitos', () => {
    expect(formatearMonto('$50.000 pesos', 'COP')).toBe('50.000');
    expect(formatearMonto('', 'COP')).toBe('');
  });

  it('no deja ceros a la izquierda', () => {
    expect(formatearMonto('0050000', 'COP')).toBe('50.000');
    expect(formatearMonto('0', 'COP')).toBe('0');
  });
});

describe('formateo con decimales', () => {
  it('agrupa la parte entera y respeta la decimal', () => {
    expect(formatearMonto('1234', 'USD')).toBe('1.234');
    expect(formatearMonto('1234,5', 'USD')).toBe('1.234,5');
    expect(formatearMonto('1234,56', 'USD')).toBe('1.234,56');
  });

  it('deja escribir el separador sin completar los decimales', () => {
    // Este es el caso que rompia con parseAmount + formatAmount.
    expect(formatearMonto('12,', 'USD')).toBe('12,');
  });

  it('recorta los decimales sobrantes', () => {
    expect(formatearMonto('12,3456', 'USD')).toBe('12,34');
  });

  it('acepta punto como separador decimal', () => {
    expect(formatearMonto('12.99', 'USD')).toBe('12,99');
  });
});

describe('descripcion por defecto', () => {
  it('nombra el gasto con la fecha', () => {
    expect(descripcionPorDefecto('7 de septiembre')).toBe('Gasto del 7 de septiembre');
  });
});
