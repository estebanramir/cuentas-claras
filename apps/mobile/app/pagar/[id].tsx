import { parseAmount } from '@cuentas/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useGrupo } from '../../src/grupo';
import { api, type Instancia } from '../../src/api';
import { Boton, Campo, Cargando, Etiqueta, Opciones, Texto } from '../../src/components/ui';
import { cuandoVence, fechaCorta, hoy, plata } from '../../src/format';
import { useInstancias, useMiembros, usePagarFactura } from '../../src/queries';
import { espacio, usePaleta } from '../../src/theme';

/**
 * Registrar el pago de una factura. Es el momento en que la factura se
 * convierte en un gasto del grupo y los balances se mueven solos.
 */
export default function Pagar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const grupo = useGrupo();
  const router = useRouter();
  const p = usePaleta();

  const instancias = useInstancias(grupo?.groupId);
  const miembros = useMiembros(grupo?.groupId);
  const pagar = usePagarFactura(grupo?.groupId);

  const instancia = (instancias.data ?? []).find((i) => i.id === id);
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [pagador, setPagador] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saltando, setSaltando] = useState(false);

  useEffect(() => {
    // Arranca con el estimado ya escrito: casi siempre es el numero correcto
    // o esta muy cerca, y ahorra teclear desde cero.
    if (instancia && !monto) setMonto(BigInt(instancia.expectedAmount).toString());
  }, [instancia, monto]);

  if (instancias.isLoading) return <Cargando />;
  if (!instancia) {
    return (
      <View style={[estilos.centro, { backgroundColor: p.fondo }]}>
        <Texto tono="apagado">No encontramos esa factura.</Texto>
      </View>
    );
  }

  const yaPagada = instancia.status === 'PAID';
  const pagadorActual = pagador ?? instancia.bill?.payerMemberId ?? grupo?.memberId ?? null;

  const confirmar = async () => {
    setError(null);
    let montoMinor: bigint;
    try {
      montoMinor = parseAmount(monto, 'COP');
    } catch {
      return setError('El monto no es valido');
    }
    if (montoMinor <= 0n) return setError('El monto debe ser mayor que cero');

    try {
      await pagar.mutateAsync({
        id: instancia.id,
        body: { paidAmount: montoMinor.toString(), date: fecha, paidByMemberId: pagadorActual },
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos registrar el pago');
    }
  };

  const saltar = async () => {
    setSaltando(true);
    setError(null);
    try {
      await api(`/api/bill-instances/${instancia.id}/skip`, { method: 'POST' });
      void instancias.refetch();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos saltar la factura');
    } finally {
      setSaltando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.fondo }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Etiqueta>{instancia.bill?.name}</Etiqueta>
        <Texto tono="tinta2" style={{ marginTop: espacio.xs, marginBottom: espacio.xl }}>
          {fechaCorta(instancia.dueDate)} · {cuandoVence(instancia.daysUntilDue)} · estimado{' '}
          {plata(instancia.expectedAmount)}
        </Texto>

        {yaPagada ? (
          <Texto tono="teDeben">Esta factura ya quedo registrada como pagada.</Texto>
        ) : (
          <>
            <Campo
              etiqueta="Cuanto pagaste"
              value={monto}
              onChangeText={setMonto}
              keyboardType="number-pad"
              style={{ fontSize: 28, fontWeight: '600' }}
              ayuda="El monto real. Con el ajustamos el estimado del proximo mes."
            />

            <Campo etiqueta="Fecha del pago" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" />

            <View style={{ marginBottom: espacio.lg }}>
              <Etiqueta style={{ marginBottom: espacio.xs }}>Quien pago</Etiqueta>
              <Opciones
                valor={pagadorActual ?? ''}
                onCambio={setPagador}
                opciones={(miembros.data ?? []).map((m) => ({ valor: m.id, texto: m.displayName }))}
              />
            </View>

            <Texto tono="apagado" menor style={{ marginBottom: espacio.lg }}>
              Al registrarlo se crea un gasto compartido del grupo con el reparto de la factura.
            </Texto>

            {error ? (
              <Texto tono="debes" menor style={{ marginBottom: espacio.md }}>
                {error}
              </Texto>
            ) : null}

            <Boton onPress={confirmar} cargando={pagar.isPending}>
              Registrar pago
            </Boton>
            <Boton variante="texto" onPress={saltar} cargando={saltando} style={{ marginTop: espacio.sm }}>
              Saltar este periodo
            </Boton>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl * 2 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
