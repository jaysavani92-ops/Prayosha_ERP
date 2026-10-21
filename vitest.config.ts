import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/worker.ts', 'src/database/scripts/**', 'src/docs/**'],
      reporter: ['text-summary', 'html'],
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts', 'tests/e2e/**/*.test.ts'],
          // One in-memory mongod for the whole run; each test file uses its own database.
          globalSetup: ['tests/helpers/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
