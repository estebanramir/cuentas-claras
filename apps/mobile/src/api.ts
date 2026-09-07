/**
 * Cliente de la API.
 *
 * Guarda los tokens en expo-secure-store, que en Android usa el keystore del
 * sistema y no el almacenamiento comun. Cuando el access token expira, renueva
 * una sola vez y reintenta la peticion; si varias peticiones caducan a la vez,
 * comparten la misma renovacion en lugar de disparar cuatro.
 */

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const LLAVE_ACCESS = 'cuentas.access';
const LLAVE_REFRESH = 'cuentas.refresh';

/**
 * El valor por defecto vive en app.json y apunta a produccion a proposito.
 *
 * `eas update` no lee el bloque `env` de los perfiles de eas.json —eso es solo
 * para builds—, asi que una actualizacion publicada se queda sin
 * EXPO_PUBLIC_API_URL. Si el respaldo fuera la direccion del emulador, cada
 * OTA dejaria la app sin servidor. El respaldo tiene que ser lo que funciona
 * para una persona real; el emulador se configura por .env en local.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'https://cuentas-claras-api.vercel.app';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let renovacionEnCurso: Promise<boolean> | null = null;
let alPerderSesion: (() => void) | null = null;

export function onSessionLost(callback: () => void): void {
  alPerderSesion = callback;
}

export async function loadTokens(): Promise<boolean> {
  accessToken = await SecureStore.getItemAsync(LLAVE_ACCESS);
  refreshToken = await SecureStore.getItemAsync(LLAVE_REFRESH);
  return Boolean(accessToken && refreshToken);
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
  accessToken = access;
  refreshToken = refresh;
  await SecureStore.setItemAsync(LLAVE_ACCESS, access);
  await SecureStore.setItemAsync(LLAVE_REFRESH, refresh);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await SecureStore.deleteItemAsync(LLAVE_ACCESS);
  await SecureStore.deleteItemAsync(LLAVE_REFRESH);
}

async function renovar(): Promise<boolean> {
  if (!refreshToken) return false;
  renovacionEnCurso ??= (async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { accessToken: string; refreshToken: string };
      await saveTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      renovacionEnCurso = null;
    }
  })();
  return renovacionEnCurso;
}

interface Opciones {
  method?: string;
  body?: unknown;
  reintentado?: boolean;
}

export async function api<T>(path: string, options: Opciones = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiError(0, 'No hay conexion con el servidor');
  }

  if (response.status === 401 && !options.reintentado) {
    if (await renovar()) return api<T>(path, { ...options, reintentado: true });
    await clearTokens();
    alPerderSesion?.();
    throw new ApiError(401, 'Tu sesion expiro');
  }

  const texto = await response.text();
  const data = texto ? (JSON.parse(texto) as unknown) : null;

  if (!response.ok) {
    const mensaje =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'Algo salio mal';
    throw new ApiError(response.status, mensaje);
  }
  return data as T;
}

// ---- Formas que devuelve la API ----

export interface Miembro {
  id: string;
  displayName: string;
  userId: string | null;
  role?: string;
  hasAccount: boolean;
}

export interface Grupo {
  id: string;
  name: string;
  defaultCurrency: string;
  members: Miembro[];
}

export interface Sesion {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  groups: {
    groupId: string;
    memberId: string;
    name: string;
    displayName: string;
    defaultCurrency: string;
    role: string;
  }[];
}

export interface BalanceMiembro {
  memberId: string;
  displayName: string;
  paid: string;
  owed: string;
  balance: string;
  balanceLabel: string;
}

export interface Transferencia {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amount: string;
  amountLabel: string;
  summary: string;
}

export interface Balances {
  members: BalanceMiembro[];
  transfers: Transferencia[];
  me: BalanceMiembro | null;
}

export interface Categoria {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Gasto {
  id: string;
  description: string;
  date: string;
  amount: string;
  currency: string;
  fxRate: string;
  amountBase: string;
  paidByMemberId: string;
  isShared: boolean;
  splitMethod: string;
  categoryId: string | null;
  category: Categoria | null;
  notes: string | null;
  billInstanceId: string | null;
  shares?: { memberId: string; amountBase: string }[];
}

export interface Factura {
  id: string;
  name: string;
  estimatedAmount: string;
  currency: string;
  recurrence: string;
  dueDayOfMonth: number | null;
  intervalDays: number | null;
  reminderDaysBefore: number[];
  payerMemberId: string;
  splitMethod: string;
  isActive: boolean;
  category: { id: string; name: string } | null;
  shares: { memberId: string; weight: string }[];
  next: { id: string; dueDate: string; expectedAmount: string } | null;
}

export interface Instancia {
  id: string;
  dueDate: string;
  expectedAmount: string;
  status: 'PENDING' | 'PAID' | 'SKIPPED';
  paidAt: string | null;
  paidAmount: string | null;
  paidCurrency: string | null;
  daysUntilDue: number;
  bill: { id: string; name: string; currency: string; groupId: string; payerMemberId: string } | null;
}

export interface Reporte {
  month: string;
  label: string;
  shared: { total: string; totalLabel: string; delta: string; deltaLabel: string; deltaPercent: number | null };
  personal: { total: string; totalLabel: string; delta: string; deltaLabel: string; deltaPercent: number | null };
  categories: {
    categoryId: string | null;
    name: string;
    icon: string;
    total: string;
    totalLabel: string;
    count: number;
    share: number;
  }[];
  previousMonth: { shared: string; label: string };
}
