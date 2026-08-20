/**
 * La casa activa.
 *
 * Una persona puede estar en varias casas —la suya y la de sus papas, por
 * ejemplo— con un nombre distinto en cada una. Como todo en el modelo cuelga
 * de `memberId` y no de `userId`, los balances de una casa no tocan los de la
 * otra: son cuentas completamente separadas.
 *
 * Aca solo vive cual esta seleccionada, y se recuerda entre aperturas.
 */

import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';

const LLAVE_CASA = 'cuentas.casaActiva';

export interface Casa {
  groupId: string;
  memberId: string;
  name: string;
  /** Como te llamas dentro de esta casa. */
  displayName: string;
  defaultCurrency: string;
  role: string;
}

interface Contexto {
  casa: Casa | null;
  casas: Casa[];
  cambiar: (groupId: string) => void;
  listo: boolean;
}

const CasaContext = createContext<Contexto | null>(null);

export function CasaProvider({ children }: { children: React.ReactNode }) {
  const { sesion } = useAuth();
  const cliente = useQueryClient();
  const [elegida, setElegida] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const casas = useMemo(() => sesion?.groups ?? [], [sesion]);

  useEffect(() => {
    (async () => {
      setElegida(await SecureStore.getItemAsync(LLAVE_CASA));
      setListo(true);
    })();
  }, []);

  // Si la casa recordada ya no existe (te sacaron, o cerraste sesion y entraste
  // con otra cuenta), se cae a la primera en vez de quedarse en blanco.
  const casa = useMemo(() => {
    if (casas.length === 0) return null;
    return casas.find((c) => c.groupId === elegida) ?? casas[0] ?? null;
  }, [casas, elegida]);

  const cambiar = useCallback(
    (groupId: string) => {
      setElegida(groupId);
      void SecureStore.setItemAsync(LLAVE_CASA, groupId);
      // Lo cacheado es de la otra casa: mostrarlo un instante seria enseñar
      // cifras de plata que no corresponden.
      cliente.clear();
    },
    [cliente],
  );

  const valor = useMemo(() => ({ casa, casas, cambiar, listo }), [casa, casas, cambiar, listo]);
  return <CasaContext.Provider value={valor}>{children}</CasaContext.Provider>;
}

export function useCasa(): Contexto {
  const contexto = useContext(CasaContext);
  if (!contexto) throw new Error('useCasa necesita estar dentro de CasaProvider');
  return contexto;
}

/** La casa activa, o null si la persona todavia no tiene ninguna. */
export function useGrupo(): Casa | null {
  return useCasa().casa;
}
