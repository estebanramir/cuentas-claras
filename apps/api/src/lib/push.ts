import { prisma } from '@cuentas/db';

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo acepta hasta 100 mensajes por llamada. Con dos usuarios sobra, pero el
 * lote esta por si el grupo crece.
 */
export async function sendPush(messages: PushMessage[]): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];
  const tickets: ExpoTicket[] = [];

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const response = await fetch(EXPO_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Expo respondio ${response.status} al enviar notificaciones`);
    }
    const payload = (await response.json()) as { data?: ExpoTicket[] };
    tickets.push(...(payload.data ?? []));
  }

  await pruneDeadTokens(messages, tickets);
  return tickets;
}

/**
 * Un token deja de servir cuando la persona desinstala la app. Expo lo reporta
 * como DeviceNotRegistered; si no se borra, cada corrida del cron reintenta un
 * envio que nunca va a llegar.
 */
async function pruneDeadTokens(messages: PushMessage[], tickets: ExpoTicket[]): Promise<void> {
  const dead = tickets
    .map((ticket, index) => (ticket.details?.error === 'DeviceNotRegistered' ? messages[index]?.to : null))
    .filter((token): token is string => Boolean(token));

  if (dead.length > 0) {
    await prisma.device.deleteMany({ where: { expoPushToken: { in: dead } } });
  }
}

export async function pushTokensForUsers(userIds: string[]): Promise<Map<string, string[]>> {
  const devices = await prisma.device.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, expoPushToken: true },
  });
  const map = new Map<string, string[]>();
  for (const device of devices) {
    const list = map.get(device.userId) ?? [];
    list.push(device.expoPushToken);
    map.set(device.userId, list);
  }
  return map;
}
