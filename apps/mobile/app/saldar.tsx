import { parseAmount } from '@cuentas/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useGrupo } from '../src/grupo';
import { Boton, Campo, Cargando, Etiqueta, Texto } from '../src/components/ui';
import { hoy, plata } from '../src/format';
import { useBalances, useSaldar } from '../src/queries';
import { espacio, usePaleta } from '../src/theme';

/** Saldar no borra gastos: agrega un abono que lleva el neto a cero. */
export default function Saldar() {
  const grupo = useGrupo();
  const router = useRouter();
  const p = usePaleta();
  const balances = useBalances(grupo?.groupId);
  const saldar = useSaldar(grupo?.groupId);

  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mio = balances.data?.me;
  const transferencia = balances.data?.transfers.find(
    (t) => t.fromMemberId === mio?.memberId || t.toMemberId === mio?.memberId,
  );

  useEffect(() => {
    if (transferencia && !monto) setMonto(BigInt(transferencia.amount).toString());
  }, [transferencia, monto]);

  if (balances.isLoading) return <Cargando />;
  if (!transferencia) {
    return (
      <ScrollView contentContainerStyle={[estilos.contenido, { backgroundColor: p.fondo, flex: 1 }]}>
        <Texto tono="apagado">No hay nada pendiente por saldar.</Texto>
      </ScrollView>
    );
  }

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
      await saldar.mutateAsync({
        groupId: grupo?.groupId,
        fromMemberId: transferencia.fromMemberId,
        toMemberId: transferencia.toMemberId,
        amount: montoMinor.toString(),
        currency: 'COP',
        date: hoy(),
        note: nota.trim() || null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos registrar el abono');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: p.fondo }}
      contentContainerStyle={estilos.contenido}
      keyboardShouldPersistTaps="handled"
    >
      <Etiqueta>Pendiente</Etiqueta>
      <Texto style={{ marginTop: espacio.xs, marginBottom: espacio.xl }}>{transferencia.summary}</Texto>

      <Campo
        etiqueta="Cuanto se abona"
        value={monto}
        onChangeText={setMonto}
        keyboardType="number-pad"
        style={{ fontSize: 28, fontWeight: '600' }}
        ayuda={`Puedes abonar menos de ${plata(transferencia.amount)} si es un pago parcial.`}
      />
      <Campo etiqueta="Nota (opcional)" value={nota} onChangeText={setNota} placeholder="Transferencia Nequi" />

      {error ? (
        <Texto tono="debes" menor style={{ marginBottom: espacio.md }}>
          {error}
        </Texto>
      ) : null}

      <Boton onPress={confirmar} cargando={saldar.isPending}>
        Registrar abono
      </Boton>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl * 2 },
});
