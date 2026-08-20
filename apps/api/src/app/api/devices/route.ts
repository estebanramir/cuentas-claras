import { prisma } from '@cuentas/db';
import { schemas } from '@cuentas/shared';
import { handler, json, readJson } from '@/lib/http';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const POST = handler(async (request) => {
  const { userId } = await requireSession(request);
  const { expoPushToken, platform } = schemas.registerDeviceInput.parse(await readJson(request));

  // El token puede haber quedado registrado a nombre de otra cuenta si dos
  // personas usaron el mismo celular; el upsert lo reasigna a la actual.
  const device = await prisma.device.upsert({
    where: { expoPushToken },
    create: { userId, expoPushToken, platform },
    update: { userId, platform, lastSeenAt: new Date() },
  });

  return json({ id: device.id, registered: true });
});
