import { addMonths, formatMonth } from '@cuentas/shared';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGrupo } from '../../src/auth';
import {
  Bloque,
  BotonPresionable,
  Cargando,
  Cifra,
  Error as ErrorVista,
  Etiqueta,
  Separador,
  Texto,
} from '../../src/components/ui';
import { hoy, plata } from '../../src/format';
import { useReporte } from '../../src/queries';
import { espacio, radio, tabular, tipo, usePaleta } from '../../src/theme';

export default function Reportes() {
  const grupo = useGrupo();
  const p = usePaleta();
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const reporte = useReporte(grupo?.groupId, mes);

  const mover = (pasos: number) => setMes(addMonths(`${mes}-01`, pasos).slice(0, 7));
  const esMesActual = mes === hoy().slice(0, 7);

  if (reporte.isLoading) return <Cargando />;
  if (reporte.error) {
    return <ErrorVista mensaje={(reporte.error as Error).message} onReintentar={() => void reporte.refetch()} />;
  }

  const datos = reporte.data;
  const mayor = datos?.categories[0] ? BigInt(datos.categories[0].total) : 1n;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.fondo }}
      contentContainerStyle={{ paddingBottom: espacio.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={reporte.isRefetching}
          onRefresh={() => void reporte.refetch()}
          tintColor={p.apagado}
        />
      }
    >
      <View style={estilos.navegacion}>
        <BotonPresionable onPress={() => mover(-1)} style={estilos.flecha}>
          <Texto tono="acento">Anterior</Texto>
        </BotonPresionable>
        <Texto fuerte>{datos?.label ?? formatMonth(`${mes}-01`)}</Texto>
        <BotonPresionable
          onPress={() => (esMesActual ? undefined : mover(1))}
          style={[estilos.flecha, { opacity: esMesActual ? 0.3 : 1 }]}
        >
          <Texto tono="acento">Siguiente</Texto>
        </BotonPresionable>
      </View>

      <View style={estilos.totales}>
        <View style={{ flex: 1 }}>
          <Etiqueta>Compartido</Etiqueta>
          <Cifra grande style={{ fontSize: 30, marginTop: espacio.xs }}>
            {datos?.shared.totalLabel ?? '$0'}
          </Cifra>
          <Comparacion
            delta={datos?.shared.delta ?? '0'}
            porcentaje={datos?.shared.deltaPercent ?? null}
            anterior={datos?.previousMonth.label ?? ''}
          />
        </View>
      </View>

      <Bloque style={{ marginTop: espacio.lg }}>
        <View style={estilos.filaResumen}>
          <Texto tono="tinta2">Mis gastos personales</Texto>
          <Cifra tono="tinta2">{datos?.personal.totalLabel ?? '$0'}</Cifra>
        </View>
        <Separador />
        <View style={estilos.filaResumen}>
          <Texto tono="tinta2">Movimientos</Texto>
          <Cifra tono="tinta2">
            {(datos?.categories ?? []).reduce((acc, c) => acc + c.count, 0)}
          </Cifra>
        </View>
      </Bloque>

      <View style={{ marginTop: espacio.xl }}>
        <View style={estilos.encabezadoSeccion}>
          <Etiqueta>En que se fue</Etiqueta>
        </View>
        <Bloque>
          {(datos?.categories ?? []).length === 0 ? (
            <View style={estilos.filaResumen}>
              <Texto tono="apagado" menor>
                No hay gastos registrados en este mes.
              </Texto>
            </View>
          ) : (
            (datos?.categories ?? []).map((categoria, indice) => (
              <View key={categoria.categoryId ?? categoria.name}>
                {indice > 0 ? <Separador /> : null}
                <View style={estilos.categoria}>
                  <View style={estilos.categoriaTexto}>
                    <Texto numberOfLines={1}>{categoria.name}</Texto>
                    <Cifra>{categoria.totalLabel}</Cifra>
                  </View>
                  <View style={[estilos.barraFondo, { backgroundColor: p.superficie2 }]}>
                    <View
                      style={[
                        estilos.barra,
                        {
                          backgroundColor: p.acento,
                          width: `${porcentajeRelativo(categoria.total, mayor)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[tipo.menor, tabular, { color: p.apagado, marginTop: 4 }]}>
                    {categoria.share}% del mes · {categoria.count}{' '}
                    {categoria.count === 1 ? 'movimiento' : 'movimientos'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Bloque>
      </View>
    </ScrollView>
  );
}

function Comparacion({
  delta,
  porcentaje,
  anterior,
}: {
  delta: string;
  porcentaje: number | null;
  anterior: string;
}) {
  const valor = BigInt(delta);
  if (valor === 0n) {
    return (
      <Texto tono="apagado" menor style={{ marginTop: espacio.xs }}>
        Igual que en {anterior}.
      </Texto>
    );
  }
  const subio = valor > 0n;
  return (
    <Texto tono={subio ? 'debes' : 'teDeben'} menor style={{ marginTop: espacio.xs }}>
      {subio ? 'Subio' : 'Bajo'} {plata(subio ? valor : -valor)}
      {porcentaje !== null ? ` (${Math.abs(porcentaje)}%)` : ''} frente a {anterior}.
    </Texto>
  );
}

function porcentajeRelativo(total: string, mayor: bigint): number {
  if (mayor === 0n) return 0;
  return Math.max(2, Number((BigInt(total) * 100n) / mayor));
}

const estilos = StyleSheet.create({
  navegacion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espacio.lg,
    paddingVertical: espacio.md,
  },
  flecha: { paddingVertical: espacio.xs },
  totales: { paddingHorizontal: espacio.lg, paddingTop: espacio.md },
  filaResumen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espacio.lg,
    paddingVertical: espacio.md,
  },
  encabezadoSeccion: { paddingHorizontal: espacio.lg, marginBottom: espacio.sm },
  categoria: { paddingHorizontal: espacio.lg, paddingVertical: espacio.md },
  categoriaTexto: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espacio.md },
  barraFondo: { height: 6, borderRadius: radio.sm, marginTop: espacio.sm, overflow: 'hidden' },
  barra: { height: 6, borderRadius: radio.sm },
});
