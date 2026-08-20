import { parseAmount } from '@cuentas/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useGrupo } from '../../../src/casa';
import { Boton, Campo, Etiqueta, Opciones, Texto } from '../../../src/components/ui';
import { hoy } from '../../../src/format';
import { useCategorias, useCrearFactura, useMiembros } from '../../../src/queries';
import { espacio, usePaleta } from '../../../src/theme';

type Recurrencia = 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'YEARLY';

export default function NuevaFactura() {
  const grupo = useGrupo();
  const router = useRouter();
  const p = usePaleta();

  const miembros = useMiembros(grupo?.groupId);
  const categorias = useCategorias(grupo?.groupId);
  const crear = useCrearFactura(grupo?.groupId);

  const [nombre, setNombre] = useState('');
  const [estimado, setEstimado] = useState('');
  const [recurrencia, setRecurrencia] = useState<Recurrencia>('MONTHLY');
  const [dia, setDia] = useState('');
  const [pagador, setPagador] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [avisos, setAvisos] = useState('5,2,0');
  const [error, setError] = useState<string | null>(null);

  const listaMiembros = miembros.data ?? [];
  const pagadorActual = pagador ?? grupo?.memberId ?? null;

  const diasAviso = useMemo(
    () =>
      avisos
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v) && v >= 0 && v <= 60),
    [avisos],
  );

  const guardar = async () => {
    setError(null);
    if (!nombre.trim()) return setError('Ponle un nombre a la factura');

    let estimadoMinor: bigint;
    try {
      estimadoMinor = parseAmount(estimado, 'COP');
    } catch {
      return setError('El monto estimado no es valido');
    }
    if (estimadoMinor <= 0n) return setError('El estimado debe ser mayor que cero');

    const diaNumero = Number(dia);
    if (!Number.isInteger(diaNumero) || diaNumero < 1 || diaNumero > 31) {
      return setError('El dia de vencimiento va de 1 a 31');
    }
    if (!pagadorActual) return setError('Falta indicar quien la paga');
    if (diasAviso.length === 0) return setError('Deja al menos un dia de aviso');

    try {
      await crear.mutateAsync({
        groupId: grupo?.groupId,
        name: nombre.trim(),
        categoryId: categoria,
        estimatedAmount: estimadoMinor.toString(),
        currency: 'COP',
        recurrence: recurrencia,
        anchorDate: hoy(),
        dueDayOfMonth: diaNumero,
        reminderDaysBefore: diasAviso,
        payerMemberId: pagadorActual,
        splitMethod: 'EQUAL',
        shares: listaMiembros.map((m) => ({ memberId: m.id })),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos crear la factura');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.fondo }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Luz, agua, internet..." autoFocus />
        <Campo
          etiqueta="Monto estimado"
          value={estimado}
          onChangeText={setEstimado}
          keyboardType="number-pad"
          placeholder="180.000"
          ayuda="Es solo para proyectar el mes. Al pagarla escribes el monto real y aprendemos el promedio."
        />

        <View style={{ marginBottom: espacio.lg }}>
          <Etiqueta style={{ marginBottom: espacio.xs }}>Cada cuanto</Etiqueta>
          <Opciones
            valor={recurrencia}
            onCambio={setRecurrencia}
            opciones={[
              { valor: 'MONTHLY' as Recurrencia, texto: 'Mensual' },
              { valor: 'BIMONTHLY' as Recurrencia, texto: 'Bimestral' },
              { valor: 'QUARTERLY' as Recurrencia, texto: 'Trimestral' },
              { valor: 'YEARLY' as Recurrencia, texto: 'Anual' },
            ]}
          />
        </View>

        <Campo
          etiqueta="Dia de vencimiento"
          value={dia}
          onChangeText={setDia}
          keyboardType="number-pad"
          placeholder="15"
          ayuda="Si el mes es mas corto que ese dia, se corre al ultimo dia del mes."
        />

        <View style={{ marginBottom: espacio.lg }}>
          <Etiqueta style={{ marginBottom: espacio.xs }}>Quien la paga</Etiqueta>
          <Opciones
            valor={pagadorActual ?? ''}
            onCambio={setPagador}
            opciones={listaMiembros.map((m) => ({ valor: m.id, texto: m.displayName }))}
          />
        </View>

        <View style={{ marginBottom: espacio.lg }}>
          <Etiqueta style={{ marginBottom: espacio.xs }}>Categoria</Etiqueta>
          <Opciones
            valor={categoria ?? ''}
            onCambio={(v) => setCategoria(v === categoria ? null : v)}
            opciones={(categorias.data ?? []).map((c) => ({ valor: c.id, texto: c.name }))}
          />
        </View>

        <Campo
          etiqueta="Avisarme"
          value={avisos}
          onChangeText={setAvisos}
          placeholder="5,2,0"
          ayuda="Dias antes del vencimiento, separados por coma. El 0 es el mismo dia. Una vez vencida avisamos a diario."
        />

        {error ? (
          <Texto tono="debes" menor style={{ marginBottom: espacio.md }}>
            {error}
          </Texto>
        ) : null}

        <Boton onPress={guardar} cargando={crear.isPending}>
          Crear factura
        </Boton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl * 2 },
});
