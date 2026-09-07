/**
 * A donde mandar a la persona segun el estado de la sesion.
 *
 * Se extrae como funcion pura porque la version anterior tenia un error que
 * no se veia leyendo el codigo: expulsaba a Inicio cualquier pantalla fuera
 * del grupo de pestañas, dejando inalcanzables ajustes, grupos, saldar y el
 * pago de facturas. La regla correcta mira solo si esta o no en el login.
 */

export type Redireccion = '/sign-in' | '/' | null;

export function decidirRedireccion(opciones: {
  cargando: boolean;
  haySesion: boolean;
  /** Primer segmento de la ruta actual: '(tabs)', 'ajustes', 'sign-in'... */
  segmentoRaiz: string | undefined;
}): Redireccion {
  const { cargando, haySesion, segmentoRaiz } = opciones;
  if (cargando) return null;

  const enLogin = segmentoRaiz === 'sign-in';
  if (!haySesion && !enLogin) return '/sign-in';
  if (haySesion && enLogin) return '/';
  return null;
}
