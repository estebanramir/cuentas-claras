import { handler, json } from '@/lib/http';
import { groupBalances } from '@/lib/balances';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { userId } = await requireSession(request);
  const me = await requireMembership(userId, id);

  const result = await groupBalances(id);
  const mine = result.members.find((m) => m.memberId === me.id);

  return json({
    ...result,
    /** Lo primero que muestra la pantalla de inicio. */
    me: mine ?? null,
  });
});
