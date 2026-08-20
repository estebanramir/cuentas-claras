import { runDailyJob } from '@/lib/reminders';
import { env } from '@/lib/env';
import { handler, json, unauthorized } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Lo dispara Vercel Cron a las 13:00 UTC, que son las 8:00 en Bogota.
 * El plan Hobby permite una corrida al día, asi que este endpoint hace todo:
 * tasas, materializacion de instancias, recordatorios y, los lunes, el resumen.
 */
export const GET = handler(async (request) => {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.cronSecret}`) throw unauthorized('Este endpoint no es publico');

  const started = Date.now();
  const result = await runDailyJob();
  return json({ ...result, tookMs: Date.now() - started });
});
