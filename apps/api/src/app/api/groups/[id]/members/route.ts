import { prisma } from '@cuentas/db';
import { schemas } from '@cuentas/shared';
import { conflict, handler, json, readJson } from '@/lib/http';
import { activeMembers, requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const { userId } = await requireSession(request);
  await requireMembership(userId, id);

  const members = await activeMembers(id);
  return json(
    members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      userId: m.userId,
      inviteEmail: m.inviteEmail,
      role: m.role,
      hasAccount: m.userId !== null,
    })),
  );
});

/**
 * Agrega a alguien al grupo. Sin correo queda como persona sin cuenta: suma y
 * resta en los balances igual que cualquiera. Con correo, la ficha se enlaza
 * sola el dia que esa persona entre con esa cuenta de Google.
 */
export const POST = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const { userId } = await requireSession(request);
  await requireMembership(userId, id);

  const input = schemas.addMemberInput.parse({ ...(await readJson(request) as object), groupId: id });
  const email = input.email?.toLowerCase() ?? null;

  if (email) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const already = await prisma.member.findFirst({
        where: { groupId: id, userId: existingUser.id, removedAt: null },
      });
      if (already) throw conflict('Esa persona ya esta en el grupo');

      const member = await prisma.member.create({
        data: { groupId: id, userId: existingUser.id, displayName: input.displayName, inviteEmail: email },
      });
      return json({ id: member.id, displayName: member.displayName, hasAccount: true }, { status: 201 });
    }
  }

  const member = await prisma.member.create({
    data: { groupId: id, displayName: input.displayName, inviteEmail: email },
  });
  return json(
    { id: member.id, displayName: member.displayName, inviteEmail: email, hasAccount: false },
    { status: 201 },
  );
});
