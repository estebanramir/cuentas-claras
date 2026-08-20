import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useGrupo } from '../../../src/grupo';
import {
  Bloque,
  Boton,
  BotonPresionable,
  Cargando,
  Cifra,
  Error as ErrorVista,
  Fila,
  Seccion,
  Texto,
  Vacio,
} from '../../../src/components/ui';
import { cuandoVence, fechaCorta, plata } from '../../../src/format';
import { useInstancias } from '../../../src/queries';
import { espacio, usePaleta } from '../../../src/theme';

export default function Facturas() {
  const grupo = useGrupo();
  const router = useRouter();
  const p = usePaleta();
  const instancias = useInstancias(grupo?.groupId);

  const { vencidas, proximas, pagadas } = useMemo(() => {
    const todas = instancias.data ?? [];
    return {
      vencidas: todas.filter((i) => i.status === 'PENDING' && i.daysUntilDue < 0),
      proximas: todas.filter((i) => i.status === 'PENDING' && i.daysUntilDue >= 0),
      pagadas: todas.filter((i) => i.status === 'PAID').reverse().slice(0, 15),
    };
  }, [instancias.data]);

  if (instancias.isLoading) return <Cargando />;
  if (instancias.error) {
    return (
      <ErrorVista mensaje={(instancias.error as Error).message} onReintentar={() => void instancias.refetch()} />
    );
  }

  const nada = vencidas.length + proximas.length + pagadas.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: p.fondo }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: espacio.xxl * 3 }}
        refreshControl={
          <RefreshControl
            refreshing={instancias.isRefetching}
            onRefresh={() => void instancias.refetch()}
            tintColor={p.apagado}
          />
        }
      >
        {nada ? (
          <Vacio
            mensaje="Registra la luz, el agua o una suscripcion y te avisamos antes de que venza."
            accion={<Boton onPress={() => router.push('/facturas/nueva')}>Crear la primera</Boton>}
          />
        ) : null}

        {vencidas.length > 0 ? (
          <Seccion titulo={`Vencidas · ${vencidas.length}`}>
            <Bloque>
              {vencidas.map((instancia, indice) => (
                <Fila
                  key={instancia.id}
                  primera={indice === 0}
                  titulo={instancia.bill?.name ?? 'Factura'}
                  detalle={cuandoVence(instancia.daysUntilDue)}
                  onPress={() => router.push(`/pagar/${instancia.id}`)}
                  derecha={<Cifra tono="debes">{plata(instancia.expectedAmount)}</Cifra>}
                />
              ))}
            </Bloque>
          </Seccion>
        ) : null}

        {proximas.length > 0 ? (
          <Seccion titulo="Proximas">
            <Bloque>
              {proximas.map((instancia, indice) => (
                <Fila
                  key={instancia.id}
                  primera={indice === 0}
                  titulo={instancia.bill?.name ?? 'Factura'}
                  detalle={`${fechaCorta(instancia.dueDate)} · ${cuandoVence(instancia.daysUntilDue)}`}
                  onPress={() => router.push(`/pagar/${instancia.id}`)}
                  derecha={<Cifra>{plata(instancia.expectedAmount)}</Cifra>}
                  subderecha="estimado"
                />
              ))}
            </Bloque>
          </Seccion>
        ) : null}

        {pagadas.length > 0 ? (
          <Seccion titulo="Pagadas">
            <Bloque>
              {pagadas.map((instancia, indice) => (
                <Fila
                  key={instancia.id}
                  primera={indice === 0}
                  titulo={instancia.bill?.name ?? 'Factura'}
                  detalle={fechaCorta(instancia.dueDate)}
                  derecha={<Cifra tono="apagado">{plata(instancia.paidAmount ?? '0')}</Cifra>}
                />
              ))}
            </Bloque>
          </Seccion>
        ) : null}
      </ScrollView>

      <BotonPresionable
        onPress={() => router.push('/facturas/nueva')}
        style={[estilos.flotante, { backgroundColor: p.acento }]}
      >
        <Feather name="plus" size={24} color={p.acentoTexto} />
      </BotonPresionable>
    </View>
  );
}

const estilos = StyleSheet.create({
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
