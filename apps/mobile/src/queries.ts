import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Balances, type Categoria, type Factura, type Gasto, type Instancia, type Miembro, type Reporte } from './api';

export const llaves = {
  balances: (groupId: string) => ['balances', groupId] as const,
  gastos: (groupId: string, filtro?: string) => ['gastos', groupId, filtro ?? 'todos'] as const,
  miembros: (groupId: string) => ['miembros', groupId] as const,
  categorias: (groupId: string) => ['categorias', groupId] as const,
  facturas: (groupId: string) => ['facturas', groupId] as const,
  instancias: (groupId: string) => ['instancias', groupId] as const,
  reporte: (groupId: string, mes: string) => ['reporte', groupId, mes] as const,
};

export function useBalances(groupId: string | undefined) {
  return useQuery({
    queryKey: llaves.balances(groupId ?? ''),
    queryFn: () => api<Balances>(`/api/groups/${groupId}/balances`),
    enabled: Boolean(groupId),
  });
}

export function useMiembros(groupId: string | undefined) {
  return useQuery({
    queryKey: llaves.miembros(groupId ?? ''),
    queryFn: () => api<Miembro[]>(`/api/groups/${groupId}/members`),
    enabled: Boolean(groupId),
    staleTime: 5 * 60_000,
  });
}

export function useCategorias(groupId: string | undefined) {
  return useQuery({
    queryKey: llaves.categorias(groupId ?? ''),
    queryFn: () => api<Categoria[]>(`/api/categories?groupId=${groupId}`),
    enabled: Boolean(groupId),
    staleTime: 10 * 60_000,
  });
}

export function useGastos(groupId: string | undefined, filtro?: 'compartidos' | 'personales') {
  const query = filtro === 'compartidos' ? '&shared=true' : filtro === 'personales' ? '&shared=false' : '';
  return useQuery({
    queryKey: llaves.gastos(groupId ?? '', filtro),
    queryFn: () => api<Gasto[]>(`/api/expenses?groupId=${groupId}${query}`),
    enabled: Boolean(groupId),
  });
}

export function useFacturas(groupId: string | undefined) {
  return useQuery({
    queryKey: llaves.facturas(groupId ?? ''),
    queryFn: () => api<Factura[]>(`/api/bills?groupId=${groupId}`),
    enabled: Boolean(groupId),
  });
}

export function useInstancias(groupId: string | undefined) {
  return useQuery({
    queryKey: llaves.instancias(groupId ?? ''),
    queryFn: () => api<Instancia[]>(`/api/bill-instances?groupId=${groupId}`),
    enabled: Boolean(groupId),
  });
}

export function useReporte(groupId: string | undefined, mes: string) {
  return useQuery({
    queryKey: llaves.reporte(groupId ?? '', mes),
    queryFn: () => api<Reporte>(`/api/reports/monthly?groupId=${groupId}&month=${mes}`),
    enabled: Boolean(groupId),
  });
}

/**
 * Todo lo que mueve plata invalida lo mismo: los balances, la lista de gastos,
 * las facturas y el reporte. Centralizarlo evita pantallas que se quedan viejas.
 */
export function useInvalidarTodo(groupId: string | undefined) {
  const cliente = useQueryClient();
  return () => {
    if (!groupId) return;
    void cliente.invalidateQueries({ queryKey: ['balances', groupId] });
    void cliente.invalidateQueries({ queryKey: ['gastos', groupId] });
    void cliente.invalidateQueries({ queryKey: ['facturas', groupId] });
    void cliente.invalidateQueries({ queryKey: ['instancias', groupId] });
    void cliente.invalidateQueries({ queryKey: ['reporte', groupId] });
  };
}

export function useGasto(id: string | undefined) {
  return useQuery({
    queryKey: ['gasto', id ?? ''],
    queryFn: () => api<Gasto>(`/api/expenses/${id}`),
    enabled: Boolean(id),
  });
}

export function useActualizarGasto(groupId: string | undefined) {
  const invalidar = useInvalidarTodo(groupId);
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api<Gasto>(`/api/expenses/${id}`, { method: 'PATCH', body }),
    onSuccess: (_datos, variables) => {
      void cliente.invalidateQueries({ queryKey: ['gasto', variables.id] });
      invalidar();
    },
  });
}

export function useCrearGasto(groupId: string | undefined) {
  const invalidar = useInvalidarTodo(groupId);
  return useMutation({
    mutationFn: (body: unknown) => api<Gasto>('/api/expenses', { method: 'POST', body }),
    onSuccess: invalidar,
  });
}

export function useCrearFactura(groupId: string | undefined) {
  const invalidar = useInvalidarTodo(groupId);
  return useMutation({
    mutationFn: (body: unknown) => api<{ id: string }>('/api/bills', { method: 'POST', body }),
    onSuccess: invalidar,
  });
}

export function usePagarFactura(groupId: string | undefined) {
  const invalidar = useInvalidarTodo(groupId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api(`/api/bill-instances/${id}/pay`, { method: 'POST', body }),
    onSuccess: invalidar,
  });
}

export function useSaldar(groupId: string | undefined) {
  const invalidar = useInvalidarTodo(groupId);
  return useMutation({
    mutationFn: (body: unknown) => api('/api/settlements', { method: 'POST', body }),
    onSuccess: invalidar,
  });
}

export function useBorrarGasto(groupId: string | undefined) {
  const invalidar = useInvalidarTodo(groupId);
  return useMutation({
    mutationFn: (id: string) => api(`/api/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: invalidar,
  });
}
