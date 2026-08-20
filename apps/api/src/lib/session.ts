import { prisma } from '@cuentas/db';
import { verifyAccessToken } from './auth';
import { forbidden, notFound, unauthorized } from './http';

export interface Session {
  userId: string;
}

export async function requireSession(request: Request): Promise<Session> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  const userId = await verifyAccessToken(header.slice(7).trim());
  return { userId };
}

/**
 * Toda ruta que toca un grupo pasa por aca primero. Devuelve el Member del
 * usuario dentro del grupo, que es lo que de verdad se usa para registrar
 * quien pago y a quien le toca.
 */
export async function requireMembership(userId: string, groupId: string) {
  const member = await prisma.member.findFirst({
    where: { groupId, userId, removedAt: null },
  });
  if (!member) {
    const exists = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    throw exists ? forbidden('No perteneces a ese grupo') : notFound('Ese grupo no existe');
  }
  return member;
}

/** Miembros activos del grupo. Incluye a las personas sin cuenta. */
export async function activeMembers(groupId: string) {
  return prisma.member.findMany({
    where: { groupId, removedAt: null },
    orderBy: { joinedAt: 'asc' },
  });
}
