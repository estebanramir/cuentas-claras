import { parseAmount, type CurrencyCode } from '@cuentas/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useGrupo } from '../../../src/casa';
import {
  Bloque,
  Boton,
  Campo,
  Cifra,
  Etiqueta,
  Fila,
  Opciones,
  Texto,
} from '../../../src/components/ui';
import { hoy, plata } from '../../../src/format';
import { useCategorias, useCrearGasto, useMiembros } from '../../../src/queries';
import { espacio, usePaleta } from '../../../src/theme';

type Metodo = 'EQUAL' | 'PERCENT' | 'EXACT';

/**
 * El caso simple —mercado, 50/50— tiene que ser monto, descripcion y guardar.
 * Todo lo demas queda con un valor por defecto sensato y solo estorba a quien
 * lo va a cambiar.
 */
export default function NuevoGasto() {
  const grupo = useGrupo();
  const router = useRouter();
  const p = usePaleta();

  const miembros = useMiembros(grupo?.groupId);
  const categorias = useCategorias(grupo?.groupId);
  const crear = useCrearGasto(grupo?.groupId);

  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<CurrencyCode>('COP');
  const [tasa, setTasa] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [pagador, setPagador] = useState<string | null>(null);
  const [compartido, setCompartido] = useState(true);
  const [participantes, setParticipantes] = useState<string[] | null>(null);
  const [metodo, setMetodo] = useState<Metodo>('EQUAL');
  const [pesos, setPesos] = useState<Record<string, string>>({});
  const [categoria, setCategoria] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listaMiembros = miembros.data ?? [];
  const yo = grupo?.memberId ?? null;
  const pagadorActual = pagador ?? yo;
  const seleccionados = participantes ?? listaMiembros.map((m) => m.id);

  const montoMinor = useMemo(() => {
    try {
      return monto.trim() ? parseAmount(monto, moneda) : 0n;
    } catch {
      return 0n;
    }
  }, [monto, moneda]);

  const alternarParticipante = (id: string) => {
    const actuales = new Set(seleccionados);
    if (actuales.has(id)) actuales.delete(id);
    else actuales.add(id);
    setParticipantes(listaMiembros.filter((m) => actuales.has(m.id)).map((m) => m.id));
  };

  const guardar = async () => {
    setError(null);
    if (montoMinor <= 0n) return setError('Escribe un monto mayor que cero');
    if (!descripcion.trim()) return setError('Ponle un nombre al gasto');
    if (!pagadorActual) return setError('Falta indicar quien pago');

    const shares = compartido
      ? seleccionados.map((id) => ({
          memberId: id,
          ...(metodo === 'EQUAL' ? {} : { weight: pesos[id] ?? '0' }),
        }))
      : [{ memberId: pagadorActual }];

    if (compartido && shares.length === 0) return setError('Elige al menos un participante');

    try {
      await crear.mutateAsync({
        groupId: grupo?.groupId,
        description: descripcion.trim(),
        amount: montoMinor.toString(),
        currency: moneda,
        ...(moneda !== 'COP' && tasa.trim() ? { fxRate: tasa.trim() } : {}),
        date: fecha,
        paidByMemberId: pagadorActual,
        categoryId: categoria,
        isShared: compartido,
        splitMethod: compartido ? metodo : 'EQUAL',
        shares,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar el gasto');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.fondo }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Campo
          etiqueta="Monto"
          value={monto}
          onChangeText={setMonto}
          keyboardType="number-pad"
          placeholder="0"
          autoFocus
          style={{ fontSize: 28, fontWeight: '600' }}
        />

        <View style={{ marginBottom: espacio.lg }}>
          <Etiqueta style={{ marginBottom: espacio.xs }}>Moneda</Etiqueta>
          <Opciones
            valor={moneda}
            onCambio={(v) => setMoneda(v)}
            opciones={[
              { valor: 'COP' as CurrencyCode, texto: 'Pesos' },
              { valor: 'USD' as CurrencyCode, texto: 'Dolares' },
              { valor: 'EUR' as CurrencyCode, texto: 'Euros' },
            ]}
          />
        </View>

        {moneda !== 'COP' ? (
          <Campo
            etiqueta="Tasa (opcional)"
            value={tasa}
            onChangeText={setTasa}
            keyboardType="decimal-pad"
            placeholder="La del dia"
            ayuda={`Pesos por 1 ${moneda}. Si la dejas vacia usamos la tasa del dia y la congelamos en este gasto.`}
          />
        ) : null}

        <Campo
          etiqueta="Descripcion"
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Mercado, arriendo, salida..."
        />

        <Campo etiqueta="Fecha" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" />

        <View style={{ marginBottom: espacio.lg }}>
          <Etiqueta style={{ marginBottom: espacio.xs }}>Quien pago</Etiqueta>
          <Opciones
            valor={pagadorActual ?? ''}
            onCambio={setPagador}
            opciones={listaMiembros.map((m) => ({ valor: m.id, texto: m.displayName }))}
          />
        </View>

        <View style={{ marginBottom: espacio.lg }}>
          <Etiqueta style={{ marginBottom: espacio.xs }}>Tipo</Etiqueta>
          <Opciones
            valor={compartido ? 'compartido' : 'personal'}
            onCambio={(v) => setCompartido(v === 'compartido')}
            opciones={[
              { valor: 'compartido', texto: 'Compartido' },
              { valor: 'personal', texto: 'Personal' },
            ]}
          />
          {!compartido ? (
            <Texto tono="apagado" menor style={{ marginTop: espacio.sm }}>
              Un gasto personal se registra a tu nombre y no entra en los balances.
            </Texto>
          ) : null}
        </View>

        {compartido ? (
          <>
            <View style={{ marginBottom: espacio.lg }}>
              <Etiqueta style={{ marginBottom: espacio.xs }}>Como se reparte</Etiqueta>
              <Opciones
                valor={metodo}
                onCambio={setMetodo}
                opciones={[
                  { valor: 'EQUAL' as Metodo, texto: 'Partes iguales' },
                  { valor: 'PERCENT' as Metodo, texto: 'Porcentaje' },
                  { valor: 'EXACT' as Metodo, texto: 'Montos exactos' },
                ]}
              />
            </View>

            <Etiqueta style={{ marginBottom: espacio.sm }}>Entre quienes</Etiqueta>
            <Bloque style={{ marginBottom: espacio.lg }}>
              {listaMiembros.map((miembro, indice) => {
                const activo = seleccionados.includes(miembro.id);
                return (
                  <Fila
                    key={miembro.id}
                    primera={indice === 0}
                    titulo={miembro.displayName}
                    detalle={miembro.hasAccount ? undefined : 'Sin cuenta en la app'}
                    onPress={() => alternarParticipante(miembro.id)}
                    derecha={
                      activo ? (
                        metodo === 'EQUAL' ? (
                          <Cifra tono="tinta">
                            {plata(
                              seleccionados.length > 0 ? montoMinor / BigInt(seleccionados.length) : 0n,
                              moneda,
                            )}
                          </Cifra>
                        ) : (
                          <Texto tono="acento" menor>
                            incluido
                          </Texto>
                        )
                      ) : (
                        <Texto tono="apagado" menor>
                          fuera
                        </Texto>
                      )
                    }
                  />
                );
              })}
            </Bloque>

            {metodo !== 'EQUAL'
              ? listaMiembros
                  .filter((m) => seleccionados.includes(m.id))
                  .map((miembro) => (
                    <Campo
                      key={miembro.id}
                      etiqueta={
                        metodo === 'PERCENT'
                          ? `${miembro.displayName} — porcentaje`
                          : `${miembro.displayName} — monto`
                      }
                      value={pesos[miembro.id] ?? ''}
                      onChangeText={(v) => setPesos((previo) => ({ ...previo, [miembro.id]: v }))}
                      keyboardType="decimal-pad"
                      placeholder={metodo === 'PERCENT' ? '50' : '0'}
                    />
                  ))
              : null}
          </>
        ) : null}

        <View style={{ marginBottom: espacio.lg }}>
          <Etiqueta style={{ marginBottom: espacio.xs }}>Categoria</Etiqueta>
          <Opciones
            valor={categoria ?? ''}
            onCambio={(v) => setCategoria(v === categoria ? null : v)}
            opciones={(categorias.data ?? []).map((c) => ({ valor: c.id, texto: c.name }))}
          />
        </View>

        {error ? (
          <Texto tono="debes" menor style={{ marginBottom: espacio.md }}>
            {error}
          </Texto>
        ) : null}

        <Boton onPress={guardar} cargando={crear.isPending}>
          Guardar gasto
        </Boton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl * 2 },
});
