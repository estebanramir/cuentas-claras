import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { useGrupo } from '../src/grupo';
import { Bloque, Boton, Campo, Cifra, Etiqueta, Fila, Seccion, Texto } from '../src/components/ui';
import { registrarDispositivo } from '../src/push';
import { useInvalidarTodo, useMiembros } from '../src/queries';
import { espacio, usePaleta } from '../src/theme';

export default function Ajustes() {
  const { sesion, salir, refrescar } = useAuth();
  const grupo = useGrupo();
  const p = usePaleta();
  const router = useRouter();
  const miembros = useMiembros(grupo?.groupId);
  const invalidar = useInvalidarTodo(grupo?.groupId);

  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [miNombre, setMiNombre] = useState(grupo?.displayName ?? '');
  const [renombrando, setRenombrando] = useState(false);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);

  const renombrarme = async () => {
    setErrorNombre(null);
    if (!grupo) return;
    setRenombrando(true);
    try {
      await api(`/api/groups/${grupo.groupId}/members/${grupo.memberId}`, {
        method: 'PATCH',
        body: { displayName: miNombre.trim() },
      });
      void miembros.refetch();
      invalidar();
      await refrescar();
    } catch (e) {
      setErrorNombre(e instanceof Error ? e.message : 'No pudimos cambiar tu nombre');
    } finally {
      setRenombrando(false);
    }
  };

  const agregar = async () => {
    setError(null);
    if (!nombre.trim()) return setError('Escribe el nombre de la persona');
    setAgregando(true);
    try {
      await api(`/api/groups/${grupo?.groupId}/members`, {
        method: 'POST',
        body: { displayName: nombre.trim(), email: correo.trim() || null },
      });
      setNombre('');
      setCorreo('');
      void miembros.refetch();
      invalidar();
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos agregar a esa persona');
    } finally {
      setAgregando(false);
    }
  };

  const probarAvisos = async () => {
    const ok = await registrarDispositivo();
    if (ok) {
      Alert.alert('Listo', 'Este celular queda registrado para recibir los recordatorios.');
      return;
    }
    // Android solo pregunta una vez: si se nego, la app ya no puede volver a
    // pedirlo y hay que ir a los ajustes del sistema. Llevarlo alli de un
    // toque evita mandar a la persona a buscar la pantalla.
    Alert.alert(
      'Sin permiso de notificaciones',
      'Android no deja volver a preguntarlo desde la app. Actívalo en los ajustes del sistema y vuelve.',
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
      ],
    );
  };

  return (
    <ScrollView style={{ backgroundColor: p.fondo }} contentContainerStyle={{ paddingBottom: espacio.xxl }}>
      <View style={estilos.cuenta}>
        <Etiqueta>Cuenta</Etiqueta>
        <Texto style={{ marginTop: espacio.xs }}>{sesion?.name}</Texto>
        <Texto tono="apagado" menor>
          {sesion?.email}
        </Texto>
      </View>

      <Seccion titulo="Como te ven en este grupo">
        <View style={estilos.formulario}>
          <Campo
            etiqueta={`Tu nombre en ${grupo?.name ?? 'este grupo'}`}
            value={miNombre}
            onChangeText={setMiNombre}
            placeholder={grupo?.displayName ?? ''}
            ayuda="Solo cambia aqui. En tus otros grupos sigues llamandote como alli decidiste."
          />
          {errorNombre ? (
            <Texto tono="debes" menor style={{ marginBottom: espacio.md }}>
              {errorNombre}
            </Texto>
          ) : null}
          <Boton
            variante="secundario"
            onPress={renombrarme}
            cargando={renombrando}
            deshabilitado={!miNombre.trim() || miNombre.trim() === grupo?.displayName}
          >
            Guardar mi nombre
          </Boton>
        </View>
      </Seccion>

      <Seccion titulo={`Quienes estan en ${grupo?.name ?? 'el grupo'}`}>
        <Bloque>
          {(miembros.data ?? []).map((miembro, indice) => (
            <Fila
              key={miembro.id}
              primera={indice === 0}
              titulo={miembro.displayName}
              detalle={miembro.hasAccount ? 'Tiene cuenta' : 'Sin cuenta en la app'}
              derecha={
                <Texto tono={miembro.hasAccount ? 'teDeben' : 'apagado'} menor>
                  {miembro.hasAccount ? 'activo' : 'invitado'}
                </Texto>
              }
            />
          ))}
        </Bloque>
      </Seccion>

      <Seccion titulo="Agregar a alguien">
        <View style={estilos.formulario}>
          <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Como quieres verlo en la lista" />
          <Campo
            etiqueta="Correo (opcional)"
            value={correo}
            onChangeText={setCorreo}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="para que pueda entrar con Google"
            ayuda="Sin correo queda como persona sin cuenta: suma y resta en los balances igual, pero no inicia sesion."
          />
          {error ? (
            <Texto tono="debes" menor style={{ marginBottom: espacio.md }}>
              {error}
            </Texto>
          ) : null}
          <Boton variante="secundario" onPress={agregar} cargando={agregando}>
            Agregar al grupo
          </Boton>
        </View>
      </Seccion>

      <Seccion titulo="Recordatorios">
        <View style={estilos.formulario}>
          <Texto tono="tinta2" menor style={{ marginBottom: espacio.md }}>
            Avisamos 5 y 2 dias antes, el dia del vencimiento, y todos los dias mientras siga sin pagarse.
            Los lunes llega el resumen de la semana.
          </Texto>
          <Boton variante="secundario" onPress={probarAvisos}>
            Registrar este celular
          </Boton>
        </View>
      </Seccion>

      <Seccion titulo="Mis grupos">
        <View style={estilos.formulario}>
          <Texto tono="tinta2" menor style={{ marginBottom: espacio.md }}>
            Cada grupo lleva cuentas aparte: los gastos y los balances de uno no se mezclan
            con los de otro.
          </Texto>
          <Boton variante="secundario" onPress={() => router.push('/grupos')}>
            Cambiar o crear grupo
          </Boton>
        </View>
      </Seccion>

      <View style={estilos.formulario}>
        <Boton variante="texto" onPress={salir}>
          Cerrar sesion
        </Boton>
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  cuenta: { paddingHorizontal: espacio.lg, paddingTop: espacio.lg },
  formulario: { paddingHorizontal: espacio.lg },
});
