import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { useGrupos } from '../src/grupo';
import { Bloque, Boton, Campo, Fila, Seccion, Texto } from '../src/components/ui';
import { espacio, usePaleta } from '../src/theme';

/**
 * Cambiar de grupo y crear grupos nuevos.
 *
 * Cada grupo lleva sus propias cuentas: los gastos, las facturas y los
 * balances de uno no se mezclan con los de otro, aunque seas la misma persona.
 */
export default function Grupos() {
  const { grupo, grupos, cambiar } = useGrupos();
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
    if (!nombre.trim()) return setError('Ponle un nombre al grupo');
    setGuardando(true);
    try {
      const nuevo = await api<{ id: string }>('/api/groups', {
        method: 'POST',
        body: { name: nombre.trim(), defaultCurrency: 'COP' },
      });
      // La sesion trae la lista de grupos, asi que hay que releerla antes de
      // poder cambiarse al recien creado.
      await refrescar();

      if (miNombre.trim()) {
        const miembros = await api<{ id: string; userId: string | null }[]>(
          `/api/groups/${nuevo.id}/members`,
        );
        const yo = miembros.find((m) => m.userId !== null);
        if (yo) {
          await api(`/api/groups/${nuevo.id}/members/${yo.id}`, {
            method: 'PATCH',
            body: { displayName: miNombre.trim() },
          });
          await refrescar();
        }
      }

      cambiar(nuevo.id);
      setNombre('');
      setMiNombre('');
      setCreando(false);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos crear el grupo');
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
          Cada grupo lleva cuentas aparte. Puedes tener un nombre distinto en cada uno.
        </Texto>
      </View>

      <Bloque>
        {grupos.map((g, indice) => {
          const activo = g.groupId === grupo?.groupId;
          return (
            <Fila
              key={g.groupId}
              primera={indice === 0}
              titulo={g.name}
              detalle={`Alli eres ${g.displayName}`}
              onPress={() => {
                cambiar(g.groupId);
                router.back();
              }}
              derecha={activo ? <Feather name="check" size={18} color={p.acento} /> : null}
            />
          );
        })}
      </Bloque>

      {creando ? (
        <Seccion titulo="Nuevo grupo">
          <View style={estilos.formulario}>
            <Campo
              etiqueta="Nombre del grupo"
              value={nombre}
              onChangeText={setNombre}
              placeholder="Casa de mis papas, Viaje a Cartagena..."
              autoFocus
            />
            <Campo
              etiqueta="Como te llamas alli (opcional)"
              value={miNombre}
              onChangeText={setMiNombre}
              placeholder="Tu nombre en este grupo"
              ayuda="Si lo dejas vacio usamos el de tu cuenta."
            />
            {error ? (
              <Texto tono="debes" menor style={{ marginBottom: espacio.md }}>
                {error}
              </Texto>
            ) : null}
            <Boton onPress={crear} cargando={guardando}>
              Crear el grupo
            </Boton>
            <Boton variante="texto" onPress={() => setCreando(false)} style={{ marginTop: espacio.xs }}>
              Cancelar
            </Boton>
          </View>
        </Seccion>
      ) : (
        <View style={estilos.formulario}>
          <Boton variante="secundario" onPress={() => setCreando(true)} style={{ marginTop: espacio.xl }}>
            Crear otro grupo
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
