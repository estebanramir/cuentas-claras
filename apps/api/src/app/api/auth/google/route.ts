import { prisma } from '@cuentas/db';
import { schemas } from '@cuentas/shared';
import { issueTokenPair, verifyGoogleIdToken } from '@/lib/auth';
import { handler, json, readJson } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const POST = handler(async (request) => {
  const { idToken } = schemas.googleAuthInput.parse(await readJson(request));
  const identity = await verifyGoogleIdToken(idToken);

  const user = await prisma.user.upsert({
    where: { googleSub: identity.sub },
    create: {
      googleSub: identity.sub,
      email: identity.email,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
    },
    update: { email: identity.email, name: identity.name, avatarUrl: identity.avatarUrl },
  });

  // Si alguien lo habia agregado al grupo como persona sin cuenta usando este
  // correo, esa ficha se enlaza ahora y conserva todo su historial de gastos.
  await prisma.member.updateMany({
    where: { userId: null, inviteEmail: identity.email, removedAt: null },
    data: { userId: user.id },
  });

  const tokens = await issueTokenPair(user.id);
  return json({
    ...tokens,
    user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
  });
});
