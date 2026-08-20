import { prisma } from '@cuentas/db';
import { handler, json, notFound } from '@/lib/http';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request) => {
  const { userId } = await requireSession(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { removedAt: null },
        include: { group: { select: { id: true, name: true, defaultCurrency: true } } },
      },
    },
  });
  if (!user) throw notFound('No encontramos tu cuenta');

  return json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    baseCurrency: user.baseCurrency,
    groups: user.memberships.map((m) => ({
      groupId: m.groupId,
      memberId: m.id,
      name: m.group.name,
      defaultCurrency: m.group.defaultCurrency,
      role: m.role,
    })),
  });
});
