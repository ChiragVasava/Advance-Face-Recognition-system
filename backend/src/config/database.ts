import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client instance.
 *
 * In development, hot-reloading via ts-node-dev would spawn a fresh
 * PrismaClient on every restart, eventually exhausting the connection pool.
 * Caching the instance on `globalThis` prevents that leak.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "info", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
