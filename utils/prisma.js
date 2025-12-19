const { PrismaClient } = require('@prisma/client');

// Reuse a single PrismaClient across the app to avoid exhausting the pool
let prisma;

if (!global.__PRISMA_CLIENT__) {
  prisma = new PrismaClient();
  global.__PRISMA_CLIENT__ = prisma;
} else {
  prisma = global.__PRISMA_CLIENT__;
}

module.exports = prisma;
