import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useGrupo } from '../../../src/casa';
import type { Gasto } from '../../../src/api';
import {
  Bloque,
  BotonPresionable,
  Cargando,
  Cifra,
  Error as ErrorVista,
  Etiqueta,
  Fila,
  Opciones,
  Texto,
  Vacio,
  Boton,
} from '../../../src/components/ui';
import { fechaCorta, plata } from '../../../src/format';
import { useGastos, useMiembros } from '../../../src/queries';
import { espacio, usePaleta } from '../../../src/theme';

type Filtro = 'todos' | 'compartidos' | 'personales';

/** Lista tipo extracto: agrupada por dia, sin una tarjeta por fila. */
export default function Gastos() {
  const grupo = useGrupo();
  const router = useRouter();
  const p = usePaleta();
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const gastos = useGastos(grupo?.groupId, filtro === 'todos' ? undefined : filtro);
  const miembros = useMiembros(grupo?.groupId);

  const nombrePorMiembro = useMemo(
    () => new Map((miembros.data ?? []).map((m) => [m.id, m.displayName])),
    [miembros.data],
  );

  const porDia = useMemo(() => {
    const mapa = new Map<string, Gasto[]>();
    for (const gasto of gastos.data ?? []) {
      const lista = mapa.get(gasto.date) ?? [];
      lista.push(gasto);
      mapa.set(gasto.date, lista);
    }
    return [...mapa.entries()];
  }, [gastos.data]);

  if (gastos.isLoading) return <Cargando />;
  if (gastos.error) {
    return <ErrorVista mensaje={(gastos.error as Error).message} onReintentar={() => void gastos.refetch()} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.fondo }}>
      <View style={estilos.filtros}>
        <Opciones
          valor={filtro}
          onCambio={setFiltro}
          opciones={[
            { valor: 'todos', texto: 'Todos' },
            { valor: 'compartidos', texto: 'Compartidos' },
            { valor: 'personales', texto: 'Personales' },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: espacio.xxl * 3 }}
        refreshControl={
          <RefreshControl
            refreshing={gastos.isRefetching}
            onRefresh={() => void gastos.refetch()}
            tintColor={p.apagado}
          />
        }
      >
        {porDia.length === 0 ? (
          <Vacio
            mensaje="Todavia no hay gastos registrados."
            accion={<Boton onPress={() => router.push('/gastos/nuevo')}>Registrar el primero</Boton>}
          />
        ) : (
          porDia.map(([dia, lista]) => {
            const total = lista.reduce((acc, g) => acc + BigInt(g.amountBase), 0n);
            return (
              <View key={dia} style={{ marginTop: espacio.lg }}>
                <View style={estilos.encabezadoDia}>
                  <Etiqueta>{fechaCorta(dia)}</Etiqueta>
                  <Texto tono="apagado" menor>
                    {plata(total)}
                  </Texto>
                </View>
                <Bloque>
                  {lista.map((gasto, indice) => (
                    <Fila
                      key={gasto.id}
                      primera={indice === 0}
                      titulo={gasto.description}
                      detalle={[
                        gasto.isShared ? nombrePorMiembro.get(gasto.paidByMemberId) ?? '' : 'Personal',
                        gasto.category?.name,
                        gasto.currency !== 'COP' ? `${gasto.amount} ${gasto.currency}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      derecha={<Cifra tono={gasto.isShared ? 'tinta' : 'apagado'}>{plata(gasto.amountBase)}</Cifra>}
                    />
                  ))}
                </Bloque>
              </View>
            );
          })
        )}
      </ScrollView>

      <BotonPresionable
        onPress={() => router.push('/gastos/nuevo')}
        style={[estilos.flotante, { backgroundColor: p.acento }]}
      >
        <Feather name="plus" size={24} color={p.acentoTexto} />
      </BotonPresionable>
    </View>
  );
}

const estilos = StyleSheet.create({
  filtros: { paddingHorizontal: espacio.lg, paddingVertical: espacio.md },
  encabezadoDia: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: espacio.lg,
    marginBottom: espacio.sm,
  },
  flotante: {
    position: 'absolute',
    right: espacio.lg,
    bottom: espacio.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
