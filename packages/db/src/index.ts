import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

/**
 * En serverless cada invocacion puede reusar el proceso anterior. Sin este
 * singleton, cada recarga en caliente abre un cliente nuevo y agota el pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
