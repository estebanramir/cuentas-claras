import { schemas } from '@cuentas/shared';
import { rotateRefreshToken } from '@/lib/auth';
import { handler, json, readJson } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const POST = handler(async (request) => {
  const { refreshToken } = schemas.refreshInput.parse(await readJson(request));
  return json(await rotateRefreshToken(refreshToken));
});
