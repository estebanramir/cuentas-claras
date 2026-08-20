import { json } from '@/lib/http';
import { todayInBogota } from '@cuentas/shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  return json({ ok: true, today: todayInBogota() });
}
