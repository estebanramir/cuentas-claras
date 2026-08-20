import { createHash, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@cuentas/db';
import { env } from './env';
import { ApiError, unauthorized } from './http';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_DAYS = 60;

let googleClient: OAuth2Client | null = null;
function client(): OAuth2Client {
  googleClient ??= new OAuth2Client();
  return googleClient;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Valida el idToken contra las llaves publicas de Google y comprueba que la
 * audiencia sea nuestro client id web. Sin esa comprobacion, un token emitido
 * para cualquier otra app de Google serviria para entrar aca.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  let payload;
  try {
    const ticket = await client().verifyIdToken({ idToken, audience: env.googleWebClientId });
    payload = ticket.getPayload();
  } catch {
    throw unauthorized('No pudimos verificar tu cuenta de Google');
  }
  if (!payload?.sub || !payload.email) throw unauthorized('Google no devolvio un correo');
  if (payload.email_verified === false) throw unauthorized('Ese correo de Google no esta verificado');

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name?.trim() || payload.email.split('@')[0]!,
    avatarUrl: payload.picture ?? null,
  };
}

function secret(): Uint8Array {
  return new TextEncoder().encode(env.jwtSecret);
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('cuentas-claras')
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: 'cuentas-claras' });
    if (!payload.sub) throw new Error('sin sub');
    return payload.sub;
  } catch {
    throw unauthorized('Tu sesion expiro');
  }
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** El refresh se guarda hasheado: si alguien lee la tabla, no puede usarlo. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000);
  await prisma.refreshToken.create({ data: { userId, tokenHash: hash(token), expiresAt } });
  return token;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function issueTokenPair(userId: string): Promise<TokenPair> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(userId),
    issueRefreshToken(userId),
  ]);
  return { accessToken, refreshToken, expiresIn: 15 * 60 };
}

/**
 * Rotacion: el refresh usado se revoca al entregar el nuevo. Si llega uno ya
 * revocado, se revocan todos los del usuario — es la señal de que un token
 * viejo se filtro y alguien lo esta reusando.
 */
export async function rotateRefreshToken(token: string): Promise<TokenPair> {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!record) throw unauthorized('Sesion invalida, vuelve a entrar');

  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new ApiError(401, 'Detectamos un uso repetido de tu sesion. Vuelve a entrar.');
  }
  if (record.expiresAt < new Date()) throw unauthorized('Tu sesion expiro, vuelve a entrar');

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
  return issueTokenPair(record.userId);
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
