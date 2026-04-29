import { PrismaClient } from "@prisma/client";

// PrismaClient Singleton
// Prevents multiple instances in development due to hot-reloading
// and optimizes connection pooling in production

declare global {
    // eslint-disable-next-line no-var
    var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}

export default prisma;
