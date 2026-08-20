/**
 * El grupo activo.
 *
 * Una persona puede estar en varios grupos —su casa, la de sus papas, un
 * viaje— con un nombre distinto en cada uno. Como todo en el modelo cuelga de
 * `memberId` y no de `userId`, los balances de un grupo no tocan los de otro:
 * son cuentas completamente separadas.
 *
 * Aca solo vive cual esta seleccionado, y se recuerda entre aperturas.
 */

import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';

const LLAVE_GRUPO = 'cuentas.grupoActivo';

export interface Grupo {
  groupId: string;
  memberId: string;
  name: string;
  /** Como te llamas dentro de este grupo. */
  displayName: string;
  defaultCurrency: string;
  role: string;
}

interface Contexto {
  grupo: Grupo | null;
  grupos: Grupo[];
  cambiar: (groupId: string) => void;
  listo: boolean;
}

const GrupoContext = createContext<Contexto | null>(null);

export function GrupoProvider({ children }: { children: React.ReactNode }) {
  const { sesion } = useAuth();
  const cliente = useQueryClient();
  const [elegido, setElegido] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const grupos = useMemo(() => sesion?.groups ?? [], [sesion]);

  useEffect(() => {
    (async () => {
      setElegido(await SecureStore.getItemAsync(LLAVE_GRUPO));
      setListo(true);
    })();
  }, []);

  // Si el grupo recordado ya no existe (te sacaron, o cerraste sesion y
  // entraste con otra cuenta), se cae al primero en vez de quedarse en blanco.
  const grupo = useMemo(() => {
    if (grupos.length === 0) return null;
    return grupos.find((g) => g.groupId === elegido) ?? grupos[0] ?? null;
  }, [grupos, elegido]);

  const cambiar = useCallback(
    (groupId: string) => {
      setElegido(groupId);
      void SecureStore.setItemAsync(LLAVE_GRUPO, groupId);
      // Lo cacheado es del otro grupo: mostrarlo un instante seria enseñar
      // cifras de plata que no corresponden.
      cliente.clear();
    },
    [cliente],
  );

  const valor = useMemo(() => ({ grupo, grupos, cambiar, listo }), [grupo, grupos, cambiar, listo]);
  return <GrupoContext.Provider value={valor}>{children}</GrupoContext.Provider>;
}

/** El contexto completo: la lista y el cambio de grupo. */
export function useGrupos(): Contexto {
  const contexto = useContext(GrupoContext);
  if (!contexto) throw new Error('useGrupos necesita estar dentro de GrupoProvider');
  return contexto;
}

/** El grupo activo, o null si la persona todavia no pertenece a ninguno. */
export function useGrupo(): Grupo | null {
  return useGrupos().grupo;
}
