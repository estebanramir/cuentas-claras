import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { usePaleta } from '../../src/theme';

/**
 * Cuatro pestañas. Cinco ya obliga a apretar los iconos, y esta app no tiene
 * cinco cosas importantes que hacer.
 */
export default function TabsLayout() {
  const p = usePaleta();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: p.acento,
        tabBarInactiveTintColor: p.apagado,
        tabBarStyle: {
          backgroundColor: p.superficie,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: p.linea,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerStyle: { backgroundColor: p.fondo },
        headerTintColor: p.tinta,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: p.fondo },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="gastos"
        options={{
          title: 'Gastos',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Feather name="list" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="facturas"
        options={{
          title: 'Facturas',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reportes"
        options={{
          title: 'Reportes',
          tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size - 2} color={color} />,
        }}
      />
    </Tabs>
  );
}
