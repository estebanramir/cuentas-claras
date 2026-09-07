import { describe, expect, it } from 'vitest';
import { decidirRedireccion } from '../navegacion';

const decidir = (haySesion: boolean, segmentoRaiz: string | undefined) =>
  decidirRedireccion({ cargando: false, haySesion, segmentoRaiz });

describe('guardian de sesion', () => {
  it('no decide nada mientras carga', () => {
    expect(decidirRedireccion({ cargando: true, haySesion: false, segmentoRaiz: '(tabs)' })).toBeNull();
  });

  it('sin sesion manda al login desde cualquier pantalla', () => {
    expect(decidir(false, '(tabs)')).toBe('/sign-in');
    expect(decidir(false, 'ajustes')).toBe('/sign-in');
    expect(decidir(false, undefined)).toBe('/sign-in');
  });

  it('sin sesion deja quedarse en el login', () => {
    expect(decidir(false, 'sign-in')).toBeNull();
  });

  it('con sesion saca del login', () => {
    expect(decidir(true, 'sign-in')).toBe('/');
  });

  it('con sesion deja estar en las pestañas', () => {
    expect(decidir(true, '(tabs)')).toBeNull();
  });

  // La regresion concreta: estas cuatro pantallas viven fuera del grupo de
  // pestañas y la version anterior las expulsaba a Inicio al instante.
  it.each(['ajustes', 'grupos', 'saldar', 'pagar'])(
    'con sesion NO expulsa de /%s',
    (pantalla) => {
      expect(decidir(true, pantalla)).toBeNull();
    },
  );
});
