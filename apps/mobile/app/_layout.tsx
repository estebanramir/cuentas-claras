import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth';
import { useEsOscuro, usePaleta } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

function crearCliente() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (intentos, error) => {
          // Sin sesion no tiene sentido reintentar; con red caida, dos veces basta.
          const status = (error as { status?: number }).status;
          if (status === 401 || status === 403 || status === 404) return false;
          return intentos < 2;
        },
      },
    },
  });
}

/** Manda al login o a las pestañas segun haya sesion, sin parpadeo intermedio. */
function Puerta({ children }: { children: React.ReactNode }) {
  const { cargando, sesion } = useAuth();
  const segmentos = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (cargando) return;
    void SplashScreen.hideAsync();
    const enTabs = segmentos[0] === '(tabs)';
    if (!sesion && enTabs) router.replace('/sign-in');
    if (sesion && !enTabs) router.replace('/');
  }, [cargando, sesion, segmentos, router]);

  return <>{children}</>;
}

export default function Layout() {
  const [cliente] = useState(crearCliente);
  const p = usePaleta();
  const oscuro = useEsOscuro();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={cliente}>
          <AuthProvider>
            <Puerta>
              <StatusBar style={oscuro ? 'light' : 'dark'} />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: p.fondo },
                  headerTintColor: p.tinta,
                  headerTitleStyle: { fontSize: 17, fontWeight: '600' },
                  headerShadowVisible: false,
                  contentStyle: { backgroundColor: p.fondo },
                  animationDuration: 200,
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="sign-in" options={{ headerShown: false }} />
                <Stack.Screen name="ajustes" options={{ title: 'Ajustes' }} />
                <Stack.Screen
                  name="pagar/[id]"
                  options={{ title: 'Registrar pago', presentation: 'modal' }}
                />
                <Stack.Screen
                  name="saldar"
                  options={{ title: 'Saldar deuda', presentation: 'modal' }}
                />
              </Stack>
            </Puerta>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
