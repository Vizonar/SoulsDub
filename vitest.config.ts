import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}', 'supabase/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 90000,
  },
});
