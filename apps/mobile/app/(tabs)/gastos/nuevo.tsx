import { useRouter } from 'expo-router';
import { Cargando } from '../../../src/components/ui';
import { FormularioGasto } from '../../../src/components/FormularioGasto';
import { hoy } from '../../../src/format';
import { useGrupo } from '../../../src/grupo';
import { useCategorias, useCrearGasto, useMiembros } from '../../../src/queries';

export default function NuevoGasto() {
  const grupo = useGrupo();
  const router = useRouter();
  const miembros = useMiembros(grupo?.groupId);
  const categorias = useCategorias(grupo?.groupId);
  const crear = useCrearGasto(grupo?.groupId);

  if (miembros.isLoading) return <Cargando />;

  return (
    <FormularioGasto
      miembros={miembros.data ?? []}
      categorias={categorias.data ?? []}
      iniciales={{ fecha: hoy(), pagador: grupo?.memberId ?? null }}
      textoBoton="Guardar gasto"
      guardando={crear.isPending}
      onGuardar={async (datos) => {
        await crear.mutateAsync({ groupId: grupo?.groupId, ...datos });
        router.back();
      }}
    />
  );
}
