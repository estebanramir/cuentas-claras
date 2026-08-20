import { prisma } from '@cuentas/db';
import { z } from 'zod';
import { handler, json, readJson } from '@/lib/http';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const createInput = z.object({
  groupId: z.string().min(1),
  name: z.string().min(1).max(40),
  icon: z.string().max(40).default('receipt'),
  color: z.string().max(20).default('neutral'),
});

export const GET = handler(async (request) => {
  const { userId } = await requireSession(request);
  const groupId = new URL(request.url).searchParams.get('groupId');
  if (!groupId) return json([]);
  await requireMembership(userId, groupId);

  const categories = await prisma.category.findMany({
    where: { OR: [{ groupId }, { groupId: null }] },
    orderBy: { name: 'asc' },
  });
  return json(categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color })));
});

export const POST = handler(async (request) => {
  const { userId } = await requireSession(request);
  const input = createInput.parse(await readJson(request));
  await requireMembership(userId, input.groupId);

  const category = await prisma.category.create({
    data: { groupId: input.groupId, name: input.name, icon: input.icon, color: input.color },
  });
  return json({ id: category.id, name: category.name, icon: category.icon, color: category.color }, { status: 201 });
});
