import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, View } from 'react-native';
import { Boton, Cargando, Error as ErrorVista, Texto } from '../../../src/components/ui';
import { FormularioGasto, type Metodo } from '../../../src/components/FormularioGasto';
import { hoy } from '../../../src/format';
import { useGrupo } from '../../../src/grupo';
import {
  useActualizarGasto,
  useBorrarGasto,
  useCategorias,
  useGasto,
  useMiembros,
} from '../../../src/queries';
import { espacio } from '../../../src/theme';
import { formatAmount, type CurrencyCode } from '@cuentas/shared';

export default function EditarGasto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const grupo = useGrupo();
  const router = useRouter();

  const gasto = useGasto(id);
  const miembros = useMiembros(grupo?.groupId);
  const categorias = useCategorias(grupo?.groupId);
  const actualizar = useActualizarGasto(grupo?.groupId);
  const borrar = useBorrarGasto(grupo?.groupId);

  const iniciales = useMemo(() => {
    const g = gasto.data;
    if (!g) return null;
    const metodo = (g.splitMethod === 'SHARES' ? 'EQUAL' : g.splitMethod) as Metodo;
    return {
      // Llega en unidades minimas: "1299" en dolares son 12,99 y no 1.299.
      monto: formatAmount(BigInt(g.amount), g.currency as CurrencyCode, { symbol: false }),
      moneda: g.currency as CurrencyCode,
      descripcion: g.description,
      fecha: g.date,
      pagador: g.paidByMemberId,
      compartido: g.isShared,
      participantes: g.shares?.map((s) => s.memberId) ?? null,
      metodo,
      categoria: g.categoryId,
    };
  }, [gasto.data]);

  if (gasto.isLoading || miembros.isLoading) return <Cargando />;
  if (gasto.error) {
    return <ErrorVista mensaje={(gasto.error as Error).message} onReintentar={() => void gasto.refetch()} />;
  }
  if (!iniciales) return <ErrorVista mensaje="No encontramos ese gasto." />;

  const confirmarBorrado = () => {
    Alert.alert(
      'Borrar este gasto',
      'Los balances se recalculan sin el. Esto no se puede deshacer desde la app.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            await borrar.mutateAsync(id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <FormularioGasto
      miembros={miembros.data ?? []}
      categorias={categorias.data ?? []}
      iniciales={{ ...iniciales, fecha: iniciales.fecha || hoy() }}
      textoBoton="Guardar cambios"
      guardando={actualizar.isPending}
      onGuardar={async (datos) => {
        await actualizar.mutateAsync({ id, body: datos });
        router.back();
      }}
      extra={
        <View style={{ marginTop: espacio.xl }}>
          <Boton variante="texto" onPress={confirmarBorrado} cargando={borrar.isPending}>
            Borrar gasto
          </Boton>
          <Texto tono="apagado" menor style={{ textAlign: 'center', marginTop: espacio.xs }}>
            Editar recalcula la conversion y el reparto completos.
          </Texto>
        </View>
      }
    />
  );
}
