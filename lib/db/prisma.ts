import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client Singleton
 * 
 * In development, hot reloading can create multiple PrismaClient instances.
 * This singleton pattern prevents that.
 * 
 * For production, consider connection pooling via PgBouncer or similar.
 */

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
