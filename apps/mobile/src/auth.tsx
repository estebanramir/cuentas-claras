import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearTokens, loadTokens, onSessionLost, saveTokens, type Sesion } from './api';
import { registrarDispositivo } from './push';

const WEB_CLIENT_ID: string =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  (Constants.expoConfig?.extra?.googleWebClientId as string | undefined) ??
  '';

interface Contexto {
  cargando: boolean;
  sesion: Sesion | null;
  entrar: () => Promise<void>;
  salir: () => Promise<void>;
  refrescar: () => Promise<void>;
  entrando: boolean;
}

const AuthContext = createContext<Contexto | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [sesion, setSesion] = useState<Sesion | null>(null);

  useEffect(() => {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, offlineAccess: false });
  }, []);

  const refrescar = useCallback(async () => {
    try {
      setSesion(await api<Sesion>('/api/me'));
    } catch {
      setSesion(null);
    }
  }, []);

  useEffect(() => {
    onSessionLost(() => setSesion(null));
    (async () => {
      if (await loadTokens()) await refrescar();
      setCargando(false);
    })();
  }, [refrescar]);

  const entrar = useCallback(async () => {
    if (!WEB_CLIENT_ID) {
      throw new Error(
        'Falta configurar el client id de Google. Ver EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.',
      );
    }
    setEntrando(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const respuesta = await GoogleSignin.signIn();
      if (!isSuccessResponse(respuesta)) return; // la persona cancelo
      const idToken = respuesta.data.idToken;
      if (!idToken) throw new Error('Google no devolvio el token de identidad');

      const datos = await api<{ accessToken: string; refreshToken: string }>('/api/auth/google', {
        method: 'POST',
        body: { idToken },
      });
      await saveTokens(datos.accessToken, datos.refreshToken);
      await refrescar();
      // Sin esperar: que falle el registro del celular no debe impedir entrar.
      void registrarDispositivo();
    } catch (error) {
      if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) return;
      throw error;
    } finally {
      setEntrando(false);
    }
  }, [refrescar]);

  const salir = useCallback(async () => {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Si Google falla al cerrar, la sesion local se cierra igual.
    }
    await clearTokens();
    setSesion(null);
  }, []);

  const valor = useMemo(
    () => ({ cargando, sesion, entrar, salir, refrescar, entrando }),
    [cargando, sesion, entrar, salir, refrescar, entrando],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): Contexto {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth necesita estar dentro de AuthProvider');
  return contexto;
}

// La casa activa vive en casa.tsx, que necesita useAuth y no al reves.
