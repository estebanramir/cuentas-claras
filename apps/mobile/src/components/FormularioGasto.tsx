import { formatDateLong, parseAmount, type CurrencyCode } from '@cuentas/shared';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { Categoria, Miembro } from '../api';
import { descripcionPorDefecto, formatearMonto } from '../formato-entrada';
import { plata } from '../format';
import { espacio, usePaleta } from '../theme';
import { Bloque, Boton, Campo, Cifra, Etiqueta, Fila, Opciones, Texto } from './ui';

export type Metodo = 'EQUAL' | 'PERCENT' | 'EXACT';

export interface DatosGasto {
  description: string;
  amount: string;
  currency: CurrencyCode;
  fxRate?: string;
  date: string;
  paidByMemberId: string;
  categoryId: string | null;
  isShared: boolean;
  splitMethod: Metodo;
  shares: { memberId: string; weight?: string }[];
}

export interface ValoresIniciales {
  monto?: string;
  moneda?: CurrencyCode;
  descripcion?: string;
  fecha: string;
  pagador?: string | null;
  compartido?: boolean;
  participantes?: string[] | null;
  metodo?: Metodo;
  pesos?: Record<string, string>;
  categoria?: string | null;
}

/**
 * El formulario de un gasto, compartido entre crear y editar.
 *
 * El caso simple —mercado, 50/50— tiene que ser monto y guardar. Todo lo demas
 * arranca con un valor por defecto sensato y solo estorba a quien lo va a
 * cambiar.
 */
export function FormularioGasto({
  miembros,
  categorias,
  iniciales,
  textoBoton,
  guardando,
  onGuardar,
  extra,
}: {
  miembros: Miembro[];
  categorias: Categoria[];
  iniciales: ValoresIniciales;
  textoBoton: string;
  guardando: boolean;
  onGuardar: (datos: DatosGasto) => Promise<void>;
  /** Acciones propias de cada pantalla, como borrar al editar. */
  extra?: React.ReactNode;
}) {
  const p = usePaleta();

  const [moneda, setMoneda] = useState<CurrencyCode>(iniciales.moneda ?? 'COP');
  const [monto, setMonto] = useState(() =>
    formatearMonto(iniciales.monto ?? '', iniciales.moneda ?? 'COP'),
  );
  const [tasa, setTasa] = useState('');
  const [descripcion, setDescripcion] = useState(iniciales.descripcion ?? '');
  const [fecha, setFecha] = useState(iniciales.fecha);
  const [pagador, setPagador] = useState<string | null>(iniciales.pagador ?? null);
  const [compartido, setCompartido] = useState(iniciales.compartido ?? true);
  const [participantes, setParticipantes] = useState<string[] | null>(iniciales.participantes ?? null);
  const [metodo, setMetodo] = useState<Metodo>(iniciales.metodo ?? 'EQUAL');
  const [pesos, setPesos] = useState<Record<string, string>>(iniciales.pesos ?? {});
  const [categoria, setCategoria] = useState<string | null>(iniciales.categoria ?? null);
  const [error, setError] = useState<string | null>(null);

  const pagadorActual = pagador ?? miembros[0]?.id ?? null;
  const seleccionados = participantes ?? miembros.map((m) => m.id);

  const montoMinor = useMemo(() => {
    try {
      return monto.trim() ? parseAmount(monto, moneda) : 0n;
    } catch {
      return 0n;
    }
  }, [monto, moneda]);

  const alternar = (id: string) => {
    const actuales = new Set(seleccionados);
    if (actuales.has(id)) actuales.delete(id);
    else actuales.add(id);
    setParticipantes(miembros.filter((m) => actuales.has(m.id)).map((m) => m.id));
  };

  const enviar = async () => {
    setError(null);
    if (montoMinor <= 0n) return setError('Escribe un monto mayor que cero');
    if (!pagadorActual) return setError('Falta indicar quien pago');
    if (compartido && seleccionados.length === 0) return setError('Elige al menos un participante');

    const shares = compartido
      ? seleccionados.map((id) => ({
          memberId: id,
          ...(metodo === 'EQUAL' ? {} : { weight: pesos[id] ?? '0' }),
        }))
      : [{ memberId: pagadorActual }];

    try {
      await onGuardar({
        // Sin descripcion, la fecha describe el gasto mejor que dejarlo en blanco.
        description: descripcion.trim() || descripcionPorDefecto(formatDateLong(fecha)),
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
          onChangeText={(t) => setMonto(formatearMonto(t, moneda))}
          keyboardType="number-pad"
          placeholder="0"
          autoFocus={!iniciales.monto}
          style={{ fontSize: 28, fontWeight: '600' }}
        />

        <View style={{ marginBottom: espacio.lg }}>
          <Etiqueta style={{ marginBottom: espacio.xs }}>Moneda</Etiqueta>
          <Opciones
            valor={moneda}
            onCambio={(v) => {
              setMoneda(v);
              setMonto((actual) => formatearMonto(actual, v));
            }}
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
            ayuda={`Pesos por 1 ${moneda}. Vacia usa la tasa del dia y la congela en este gasto.`}
          />
        ) : null}

        <Campo
          etiqueta="Descripcion (opcional)"
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder={descripcionPorDefecto(formatDateLong(fecha))}
          ayuda="Si la dejas vacia usamos la fecha."
        />

        <Campo etiqueta="Fecha" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" />

        <View style={{ marginBottom: espacio.lg }}>
          <Etiqueta style={{ marginBottom: espacio.xs }}>Quien pago</Etiqueta>
          <Opciones
            valor={pagadorActual ?? ''}
            onCambio={setPagador}
            opciones={miembros.map((m) => ({ valor: m.id, texto: m.displayName }))}
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
              {miembros.map((miembro, indice) => {
                const activo = seleccionados.includes(miembro.id);
                return (
                  <Fila
                    key={miembro.id}
                    primera={indice === 0}
                    titulo={miembro.displayName}
                    detalle={miembro.hasAccount ? undefined : 'Sin cuenta en la app'}
                    onPress={() => alternar(miembro.id)}
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
              ? miembros
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
            opciones={categorias.map((c) => ({ valor: c.id, texto: c.name }))}
          />
        </View>

        {error ? (
          <Texto tono="debes" menor style={{ marginBottom: espacio.md }}>
            {error}
          </Texto>
        ) : null}

        <Boton onPress={enviar} cargando={guardando}>
          {textoBoton}
        </Boton>
        {extra}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl * 2 },
});
