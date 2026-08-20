import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { useCasa } from '../src/casa';
import { Bloque, Boton, Campo, Etiqueta, Fila, Seccion, Texto } from '../src/components/ui';
import { espacio, usePaleta } from '../src/theme';

/**
 * Cambiar de casa y crear casas nuevas.
 *
 * Cada casa lleva sus propias cuentas: los gastos, las facturas y los balances
 * de una no se mezclan con los de otra, aunque seas la misma persona.
 */
export default function Casas() {
  const { casa, casas, cambiar } = useCasa();
  const { refrescar } = useAuth();
  const router = useRouter();
  const p = usePaleta();

  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [miNombre, setMiNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setError(null);
    if (!nombre.trim()) return setError('Ponle un nombre a la casa');
    setGuardando(true);
    try {
      const nueva = await api<{ id: string }>('/api/groups', {
        method: 'POST',
        body: { name: nombre.trim(), defaultCurrency: 'COP' },
      });
      // La sesion trae la lista de casas, asi que hay que releerla antes de
      // poder cambiarse a la recien creada.
      await refrescar();

      if (miNombre.trim()) {
        const miembros = await api<{ id: string; userId: string | null }[]>(
          `/api/groups/${nueva.id}/members`,
        );
        const yo = miembros.find((m) => m.userId !== null);
        if (yo) {
          await api(`/api/groups/${nueva.id}/members/${yo.id}`, {
            method: 'PATCH',
            body: { displayName: miNombre.trim() },
          });
          await refrescar();
        }
      }

      cambiar(nueva.id);
      setNombre('');
      setMiNombre('');
      setCreando(false);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos crear la casa');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: p.fondo }}
      contentContainerStyle={{ paddingBottom: espacio.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={estilos.intro}>
        <Texto tono="tinta2" menor>
          Cada casa lleva cuentas aparte. Puedes tener un nombre distinto en cada una.
        </Texto>
      </View>

      <Bloque>
        {casas.map((c, indice) => {
          const activa = c.groupId === casa?.groupId;
          return (
            <Fila
              key={c.groupId}
              primera={indice === 0}
              titulo={c.name}
              detalle={`Alli eres ${c.displayName}`}
              onPress={() => {
                cambiar(c.groupId);
                router.back();
              }}
              derecha={
                activa ? <Feather name="check" size={18} color={p.acento} /> : null
              }
            />
          );
        })}
      </Bloque>

      {creando ? (
        <Seccion titulo="Nueva casa">
          <View style={estilos.formulario}>
            <Campo
              etiqueta="Nombre de la casa"
              value={nombre}
              onChangeText={setNombre}
              placeholder="Casa de mis papas"
              autoFocus
            />
            <Campo
              etiqueta="Como te llamas alli (opcional)"
              value={miNombre}
              onChangeText={setMiNombre}
              placeholder="Tu nombre en esta casa"
              ayuda="Si lo dejas vacio usamos el de tu cuenta."
            />
            {error ? (
              <Texto tono="debes" menor style={{ marginBottom: espacio.md }}>
                {error}
              </Texto>
            ) : null}
            <Boton onPress={crear} cargando={guardando}>
              Crear la casa
            </Boton>
            <Boton variante="texto" onPress={() => setCreando(false)} style={{ marginTop: espacio.xs }}>
              Cancelar
            </Boton>
          </View>
        </Seccion>
      ) : (
        <View style={estilos.formulario}>
          <Boton variante="secundario" onPress={() => setCreando(true)} style={{ marginTop: espacio.xl }}>
            Crear otra casa
          </Boton>
        </View>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  intro: { paddingHorizontal: espacio.lg, paddingTop: espacio.lg, paddingBottom: espacio.md },
  formulario: { paddingHorizontal: espacio.lg },
});
