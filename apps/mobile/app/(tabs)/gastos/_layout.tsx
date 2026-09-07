import { Stack } from 'expo-router';
import { usePaleta } from '../../../src/theme';

export default function GastosLayout() {
  const p = usePaleta();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: p.fondo },
        headerTintColor: p.tinta,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: p.fondo },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Gastos' }} />
      <Stack.Screen name="nuevo" options={{ title: 'Nuevo gasto', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Editar gasto' }} />
    </Stack>
  );
}
