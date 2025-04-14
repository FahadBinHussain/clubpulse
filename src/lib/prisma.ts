import { PrismaClient } from '@prisma/client';

// Declare a global variable to hold the PrismaClient instance
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Initialize PrismaClient, reusing the instance in development
export const prisma = global.prisma || new PrismaClient({
  // Log database queries (optional, useful for debugging)
  // log: ['query', 'info', 'warn', 'error'],
});

// In development, store the instance globally to avoid creating multiple instances
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
} 