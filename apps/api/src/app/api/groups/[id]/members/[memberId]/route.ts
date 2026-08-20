import { prisma } from '@cuentas/db';
import { z } from 'zod';
import { badRequest, conflict, forbidden, handler, json, notFound, readJson } from '@/lib/http';
import { requireMembership, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; memberId: string }> };

const patchInput = z.object({ displayName: z.string().min(1).max(60) });

/**
 * Cambiar como se llama alguien dentro de esta casa.
 *
 * El nombre vive en el Member, no en el User, asi que la misma persona puede
 * ser "Esteban" en una casa y "Estebitan" en la de sus papas sin que una cosa
 * pise la otra.
 */
export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { id, memberId } = await params;
  const { userId } = await requireSession(request);
  const yo = await requireMembership(userId, id);

  const objetivo = await prisma.member.findFirst({ where: { id: memberId, groupId: id, removedAt: null } });
  if (!objetivo) throw notFound('Esa persona no esta en la casa');

  // Cualquiera puede renombrarse a si mismo o a las personas sin cuenta; para
  // cambiarle el nombre a otro que si tiene cuenta hay que ser el dueño.
  const esMio = objetivo.id === yo.id;
  const esSinCuenta = objetivo.userId === null;
  if (!esMio && !esSinCuenta && yo.role !== 'OWNER') {
    throw forbidden('Solo esa persona puede cambiar su propio nombre');
  }

  const { displayName } = patchInput.parse(await readJson(request));
  const actualizado = await prisma.member.update({
    where: { id: memberId },
    data: { displayName: displayName.trim() },
  });

  return json({ id: actualizado.id, displayName: actualizado.displayName });
});

/**
 * Sacar a alguien de la casa. Es baja logica: sus gastos siguen contando en el
 * historico, porque borrarlos descuadraria los balances de todos los demas.
 */
export const DELETE = handler(async (request: Request, { params }: Params) => {
  const { id, memberId } = await params;
  const { userId } = await requireSession(request);
  const yo = await requireMembership(userId, id);

  const objetivo = await prisma.member.findFirst({ where: { id: memberId, groupId: id, removedAt: null } });
  if (!objetivo) throw notFound('Esa persona no esta en la casa');
  if (objetivo.id !== yo.id && yo.role !== 'OWNER') throw forbidden('No puedes sacar a esa persona');

  const restantes = await prisma.member.count({ where: { groupId: id, removedAt: null } });
  if (restantes <= 1) throw badRequest('La casa se quedaria sin nadie');

  // Con saldo pendiente, sacarlo dejaria una deuda sin dueño.
  const { groupBalances } = await import('@/lib/balances');
  const balances = await groupBalances(id);
  const suyo = balances.members.find((m) => m.memberId === memberId);
  if (suyo && BigInt(suyo.balance) !== 0n) {
    throw conflict('Esa persona tiene saldo pendiente. Salden la deuda antes de sacarla.');
  }

  await prisma.member.update({ where: { id: memberId }, data: { removedAt: new Date() } });
  return json({ removed: true });
});
