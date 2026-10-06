import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Cada suite levanta un PostgreSQL real embebido y algunas generan PDF en un hilo aparte: necesitan margen.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    include: ['tests/**/*.test.ts'],
  },
});
