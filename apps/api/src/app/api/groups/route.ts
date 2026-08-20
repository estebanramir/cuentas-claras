import { prisma } from '@cuentas/db';
import { schemas } from '@cuentas/shared';
import { handler, json, readJson } from '@/lib/http';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Categorias con las que arranca todo grupo nuevo. */
const CATEGORIAS_INICIALES = [
  { name: 'Mercado', icon: 'shopping-cart', color: 'verde' },
  { name: 'Servicios', icon: 'zap', color: 'ambar' },
  { name: 'Arriendo', icon: 'home', color: 'azul' },
  { name: 'Transporte', icon: 'car', color: 'gris' },
  { name: 'Salidas', icon: 'utensils', color: 'terracota' },
  { name: 'Salud', icon: 'heart-pulse', color: 'rojo' },
  { name: 'Suscripciones', icon: 'repeat', color: 'violeta' },
  { name: 'Otros', icon: 'receipt', color: 'neutral' },
];

export const GET = handler(async (request) => {
  const { userId } = await requireSession(request);
  const groups = await prisma.group.findMany({
    where: { archivedAt: null, members: { some: { userId, removedAt: null } } },
    include: { members: { where: { removedAt: null } } },
    orderBy: { createdAt: 'asc' },
  });

  return json(
    groups.map((group) => ({
      id: group.id,
      name: group.name,
      defaultCurrency: group.defaultCurrency,
      members: group.members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        userId: m.userId,
        role: m.role,
        hasAccount: m.userId !== null,
      })),
    })),
  );
});

export const POST = handler(async (request) => {
  const { userId } = await requireSession(request);
  const input = schemas.createGroupInput.parse(await readJson(request));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const group = await prisma.group.create({
    data: {
      name: input.name,
      defaultCurrency: input.defaultCurrency,
      createdById: userId,
      members: { create: { userId, displayName: user.name, role: 'OWNER' } },
      categories: { create: CATEGORIAS_INICIALES },
    },
    include: { members: true },
  });

  return json(
    {
      id: group.id,
      name: group.name,
      defaultCurrency: group.defaultCurrency,
      members: group.members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        userId: m.userId,
        role: m.role,
        hasAccount: m.userId !== null,
      })),
    },
    { status: 201 },
  );
});
