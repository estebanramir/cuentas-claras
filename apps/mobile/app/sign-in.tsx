import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';
import { Boton, Texto, Titulo } from '../src/components/ui';
import { espacio, usePaleta } from '../src/theme';

export default function Entrar() {
  const { entrar, entrando } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const p = usePaleta();
  const insets = useSafeAreaInsets();

  const intentar = async () => {
    setError(null);
    try {
      await entrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos entrar');
    }
  };

  return (
    <View
      style={[
        estilos.pantalla,
        { backgroundColor: p.fondo, paddingTop: insets.top, paddingBottom: insets.bottom + espacio.xl },
      ]}
    >
      <View style={estilos.centro}>
        <View style={estilos.marca}>
          <View style={[estilos.barra, { backgroundColor: p.acento, width: 84 }]} />
          <View style={[estilos.barra, { backgroundColor: p.acento, width: 52 }]} />
        </View>
        <Titulo style={{ fontSize: 30, marginTop: espacio.xl }}>Cuentas Claras</Titulo>
        <Texto tono="tinta2" style={{ marginTop: espacio.sm, textAlign: 'center', maxWidth: 280 }}>
          Los gastos compartidos y las facturas que vienen, en un solo lugar.
        </Texto>
      </View>

      <View style={estilos.pie}>
        {error ? (
          <Texto tono="debes" menor style={{ marginBottom: espacio.md, textAlign: 'center' }}>
            {error}
          </Texto>
        ) : null}
        <Boton onPress={intentar} cargando={entrando}>
          Entrar con Google
        </Boton>
        <Texto tono="apagado" menor style={{ marginTop: espacio.md, textAlign: 'center' }}>
          Usamos tu cuenta de Google solo para identificarte.
        </Texto>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, paddingHorizontal: espacio.xl },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  marca: { gap: 10, alignItems: 'center' },
  barra: { height: 16, borderRadius: 8 },
  pie: { paddingBottom: espacio.xl },
});
