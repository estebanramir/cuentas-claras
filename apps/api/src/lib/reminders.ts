import { type NotifyKind, prisma } from '@cuentas/db';
import {
  type CivilDate,
  addDays,
  formatAmount,
  formatDateLong,
  isMonday,
  reminderFor,
  todayInBogota,
} from '@cuentas/shared';
import { groupBalances } from './balances';
import { materializeInstances } from './bills';
import { syncDailyRates, toDbDate } from './fx';
import { type PushMessage, pushTokensForUsers, sendPush } from './push';

const DIGEST_WINDOW_DAYS = 7;

export interface DailyJobResult {
  today: CivilDate;
  ratesSynced: number | null;
  ratesError: string | null;
  instancesCreated: number;
  remindersSent: number;
  digestsSent: number;
}

/**
 * El unico trabajo programado de la app, a las 8:00 de Bogota.
 * Cada paso esta aislado: si la fuente de tasas esta caida, los recordatorios
 * salen igual, porque avisar de una factura no depende del dolar.
 */
export async function runDailyJob(today: CivilDate = todayInBogota()): Promise<DailyJobResult> {
  let ratesSynced: number | null = null;
  let ratesError: string | null = null;
  try {
    ratesSynced = await syncDailyRates(today);
  } catch (error) {
    ratesError = error instanceof Error ? error.message : 'fallo desconocido';
    console.error('[cron] no se pudieron traer las tasas', error);
  }

  const instancesCreated = await materializeInstances({ today });
  const remindersSent = await sendBillReminders(today);
  const digestsSent = isMonday(today) ? await sendWeeklyDigest(today) : 0;

  return { today, ratesSynced, ratesError, instancesCreated, remindersSent, digestsSent };
}

/**
 * La escalera de avisos. Antes del vencimiento solo suena en los dias
 * configurados; una vez vencida, insiste todos los dias hasta que se pague.
 */
export async function sendBillReminders(today: CivilDate): Promise<number> {
  const horizon = addDays(today, 60);
  const instances = await prisma.billInstance.findMany({
    where: { status: 'PENDING', dueDate: { lte: toDbDate(horizon) } },
    include: {
      bill: {
        include: {
          group: {
            include: {
              members: { where: { removedAt: null, userId: { not: null } }, select: { userId: true } },
            },
          },
        },
      },
    },
  });

  const messages: PushMessage[] = [];
  const logs: { userId: string; kind: NotifyKind; billInstanceId: string; dedupeKey: string; title: string; body: string }[] = [];

  for (const instance of instances) {
    const dueDate = instance.dueDate.toISOString().slice(0, 10) as CivilDate;
    const decision = reminderFor(dueDate, today, instance.bill.reminderDaysBefore);
    if (!decision) continue;

    const kind: NotifyKind =
      decision.kind === 'BEFORE'
        ? 'BILL_BEFORE'
        : decision.kind === 'DUE_TODAY'
          ? 'BILL_DUE_TODAY'
          : 'BILL_OVERDUE';

    const amount = formatAmount(instance.expectedAmountMinor, 'COP');
    const title =
      decision.kind === 'BEFORE'
        ? `${instance.bill.name} vence en ${decision.daysUntilDue} ${plural(decision.daysUntilDue, 'dia', 'dias')}`
        : decision.kind === 'DUE_TODAY'
          ? `${instance.bill.name} vence hoy`
          : `${instance.bill.name} esta vencida`;
    const body =
      decision.kind === 'OVERDUE'
        ? `Se vencio hace ${Math.abs(decision.daysUntilDue)} ${plural(Math.abs(decision.daysUntilDue), 'dia', 'dias')}. Estimado ${amount}.`
        : `Estimado ${amount} · vence el ${formatDateLong(dueDate)}`;

    // El aviso vencido cambia de texto cada dia, asi que la llave incluye la
    // fecha del vencimiento y no el conteo, para que sentOn haga la deduplicacion.
    const dedupeKey = `${kind}:${instance.id}`;

    for (const member of instance.bill.group.members) {
      if (!member.userId) continue;
      logs.push({ userId: member.userId, kind, billInstanceId: instance.id, dedupeKey, title, body });
    }
  }

  const tokens = await pushTokensForUsers([...new Set(logs.map((l) => l.userId))]);
  let sent = 0;

  for (const log of logs) {
    // Se escribe el log antes de enviar: es preferible perder un aviso que
    // duplicarlo, y el del dia siguiente cubre el hueco.
    const written = await prisma.notifyLog.createMany({
      data: [{ ...log, sentOn: toDbDate(today) }],
      skipDuplicates: true,
    });
    if (written.count === 0) continue;

    for (const token of tokens.get(log.userId) ?? []) {
      messages.push({
        to: token,
        title: log.title,
        body: log.body,
        data: { kind: log.kind, billInstanceId: log.billInstanceId },
      });
    }
    sent++;
  }

  await deliver(messages);
  return sent;
}

/** El resumen de los lunes: lo que viene esta semana y como va el balance. */
export async function sendWeeklyDigest(today: CivilDate): Promise<number> {
  const until = addDays(today, DIGEST_WINDOW_DAYS);
  const groups = await prisma.group.findMany({
    where: { archivedAt: null },
    include: { members: { where: { removedAt: null, userId: { not: null } } } },
  });

  const messages: PushMessage[] = [];
  let sent = 0;

  for (const group of groups) {
    const upcoming = await prisma.billInstance.findMany({
      where: {
        status: 'PENDING',
        dueDate: { gte: toDbDate(today), lte: toDbDate(until) },
        bill: { groupId: group.id },
      },
      include: { bill: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    });

    const balances = await groupBalances(group.id);
    const total = upcoming.reduce((acc, i) => acc + i.expectedAmountMinor, 0n);

    const title =
      upcoming.length === 0
        ? 'Semana despejada'
        : `Esta semana vence${upcoming.length === 1 ? '' : 'n'} ${upcoming.length} ${plural(upcoming.length, 'factura', 'facturas')} por ${formatAmount(total, 'COP')}`;

    const userIds = group.members.map((m) => m.userId).filter((id): id is string => Boolean(id));
    const tokens = await pushTokensForUsers(userIds);

    for (const member of group.members) {
      if (!member.userId) continue;
      const mine = balances.members.find((b) => b.memberId === member.id);
      const body = buildDigestBody(upcoming.map((i) => i.bill.name), mine?.balance ?? '0');

      const written = await prisma.notifyLog.createMany({
        data: [
          {
            userId: member.userId,
            kind: 'WEEKLY_DIGEST',
            dedupeKey: `WEEKLY_DIGEST:${group.id}`,
            sentOn: toDbDate(today),
            title,
            body,
          },
        ],
        skipDuplicates: true,
      });
      if (written.count === 0) continue;

      for (const token of tokens.get(member.userId) ?? []) {
        messages.push({ to: token, title, body, data: { kind: 'WEEKLY_DIGEST', groupId: group.id } });
      }
      sent++;
    }
  }

  await deliver(messages);
  return sent;
}

function buildDigestBody(names: string[], balanceMinor: string): string {
  const balance = BigInt(balanceMinor);
  const saldo =
    balance === 0n
      ? 'Estan a mano.'
      : balance > 0n
        ? `Te deben ${formatAmount(balance, 'COP')}.`
        : `Debes ${formatAmount(-balance, 'COP')}.`;

  if (names.length === 0) return `No vence nada. ${saldo}`;
  const lista = names.slice(0, 3).join(', ');
  const resto = names.length > 3 ? ` y ${names.length - 3} mas` : '';
  return `${lista}${resto}. ${saldo}`;
}

async function deliver(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    await sendPush(messages);
    await prisma.notifyLog.updateMany({
      where: { deliveredAt: null, createdAt: { gte: new Date(Date.now() - 60_000) } },
      data: { deliveredAt: new Date() },
    });
  } catch (error) {
    console.error('[cron] fallo el envio de notificaciones', error);
  }
}

function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? singular : plural_;
}
