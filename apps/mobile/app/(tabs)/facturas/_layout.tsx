import { Stack } from 'expo-router';
import { usePaleta } from '../../../src/theme';

export default function FacturasLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Facturas' }} />
      <Stack.Screen name="nueva" options={{ title: 'Nueva factura', presentation: 'modal' }} />
    </Stack>
  );
}
