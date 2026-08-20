import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { api } from '../../src/api';
import { useAuth, useGrupo } from '../../src/auth';
import {
  Bloque,
  Boton,
  BotonPresionable,
  Cargando,
  Cifra,
  Error as ErrorVista,
  Etiqueta,
  Fila,
  Seccion,
  Texto,
} from '../../src/components/ui';
import { cuandoVence, plata } from '../../src/format';
import { useBalances, useInstancias } from '../../src/queries';
import { espacio, tipo, usePaleta } from '../../src/theme';

/**
 * Responde dos preguntas sin que toques nada: cuanto debes o te deben ahora
 * mismo, y que se vence antes del domingo.
 */
export default function Inicio() {
  const grupo = useGrupo();
  const { sesion } = useAuth();
  const router = useRouter();
  const p = usePaleta();

  const balances = useBalances(grupo?.groupId);
  const instancias = useInstancias(grupo?.groupId);

  const recargando = balances.isRefetching || instancias.isRefetching;
  const recargar = () => {
    void balances.refetch();
    void instancias.refetch();
  };

  if (!grupo) return <PrimerGrupo />;
  if (balances.isLoading) return <Cargando />;
  if (balances.error) {
    return <ErrorVista mensaje={(balances.error as Error).message} onReintentar={recargar} />;
  }

  const mio = balances.data?.me;
  const saldo = BigInt(mio?.balance ?? '0');
  const transferencia = balances.data?.transfers.find(
    (t) => t.fromMemberId === mio?.memberId || t.toMemberId === mio?.memberId,
  );

  const pendientes = (instancias.data ?? [])
    .filter((i) => i.status === 'PENDING' && i.daysUntilDue <= 8)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const totalPendiente = pendientes.reduce((acc, i) => acc + BigInt(i.expectedAmount), 0n);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.fondo }}
      contentContainerStyle={{ paddingBottom: espacio.xxl }}
      refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} tintColor={p.apagado} />}
    >
      <View style={estilos.encabezado}>
        <View style={{ flex: 1 }}>
          <Texto tono="apagado" menor>
            {grupo.name}
          </Texto>
          <Texto tono="tinta2" menor>
            Hola, {sesion?.name.split(' ')[0]}
          </Texto>
        </View>
        <BotonPresionable onPress={() => router.push('/ajustes')} style={estilos.iconoCabecera}>
          <Feather name="settings" size={20} color={p.apagado} />
        </BotonPresionable>
      </View>

      <View style={estilos.saldo}>
        <Etiqueta>{saldo === 0n ? 'Estan a mano' : saldo > 0n ? 'Te deben' : 'Debes'}</Etiqueta>
        <Cifra grande tono={saldo === 0n ? 'tinta' : saldo > 0n ? 'teDeben' : 'debes'} style={{ marginTop: espacio.xs }}>
          {plata(saldo < 0n ? -saldo : saldo)}
        </Cifra>
        {transferencia ? (
          <Texto tono="tinta2" style={{ marginTop: espacio.sm }}>
            {transferencia.summary}
          </Texto>
        ) : (
          <Texto tono="apagado" style={{ marginTop: espacio.sm }}>
            No hay cuentas pendientes entre ustedes.
          </Texto>
        )}

        <View style={estilos.acciones}>
          <Boton style={{ flex: 1 }} onPress={() => router.push('/gastos/nuevo')}>
            Registrar gasto
          </Boton>
          {saldo !== 0n ? (
            <Boton variante="secundario" style={{ flex: 1 }} onPress={() => router.push('/saldar')}>
              Saldar
            </Boton>
          ) : null}
        </View>
      </View>

      <Seccion
        titulo={pendientes.length > 0 ? `Esta semana · ${plata(totalPendiente)}` : 'Esta semana'}
        accion={
          <Texto tono="acento" menor onPress={() => router.push('/facturas')}>
            Ver todas
          </Texto>
        }
      >
        <Bloque>
          {pendientes.length === 0 ? (
            <View style={estilos.sinNada}>
              <Texto tono="apagado" menor>
                No vence nada en los proximos ocho dias.
              </Texto>
            </View>
          ) : (
            pendientes.map((instancia, indice) => (
              <Fila
                key={instancia.id}
                primera={indice === 0}
                titulo={instancia.bill?.name ?? 'Factura'}
                detalle={cuandoVence(instancia.daysUntilDue)}
                onPress={() => router.push(`/pagar/${instancia.id}`)}
                derecha={
                  <Cifra tono={instancia.daysUntilDue < 0 ? 'debes' : 'tinta'}>
                    {plata(instancia.expectedAmount)}
                  </Cifra>
                }
              />
            ))
          )}
        </Bloque>
      </Seccion>

      <Seccion titulo="Como va cada uno">
        <Bloque>
          {(balances.data?.members ?? []).map((miembro, indice) => {
            const valor = BigInt(miembro.balance);
            return (
              <Fila
                key={miembro.memberId}
                primera={indice === 0}
                titulo={miembro.displayName}
                detalle={`Puso ${plata(miembro.paid)} · le tocaba ${plata(miembro.owed)}`}
                derecha={
                  <Cifra tono={valor === 0n ? 'apagado' : valor > 0n ? 'teDeben' : 'debes'}>
                    {plata(valor, 'COP', true)}
                  </Cifra>
                }
              />
            );
          })}
        </Bloque>
      </Seccion>
    </ScrollView>
  );
}

/** Lo que ve alguien que entra por primera vez y todavia no tiene grupo. */
function PrimerGrupo() {
  const { refrescar } = useAuth();
  const p = usePaleta();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setCreando(true);
    setError(null);
    try {
      await api('/api/groups', { method: 'POST', body: { name: 'Casa', defaultCurrency: 'COP' } });
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos crear el grupo');
    } finally {
      setCreando(false);
    }
  };

  return (
    <View style={[estilos.primerGrupo, { backgroundColor: p.fondo }]}>
      <Texto style={[tipo.titulo, { textAlign: 'center' }]}>Empecemos por la casa</Texto>
      <Texto tono="tinta2" style={{ textAlign: 'center', marginTop: espacio.sm, marginBottom: espacio.xl }}>
        Creamos un grupo para llevar los gastos compartidos. Despues invitas a quien quieras.
      </Texto>
      {error ? (
        <Texto tono="debes" menor style={{ marginBottom: espacio.md, textAlign: 'center' }}>
          {error}
        </Texto>
      ) : null}
      <Boton onPress={crear} cargando={creando}>
        Crear el grupo
      </Boton>
    </View>
  );
}

const estilos = StyleSheet.create({
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.md,
    paddingBottom: espacio.sm,
  },
  iconoCabecera: { padding: espacio.sm },
  saldo: { paddingHorizontal: espacio.lg, paddingTop: espacio.lg, paddingBottom: espacio.sm },
  acciones: { flexDirection: 'row', gap: espacio.md, marginTop: espacio.xl },
  sinNada: { paddingHorizontal: espacio.lg, paddingVertical: espacio.lg },
  primerGrupo: { flex: 1, justifyContent: 'center', paddingHorizontal: espacio.xl },
});
