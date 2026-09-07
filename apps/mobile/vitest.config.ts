import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Quedaron directorios `node_modules.obsoleto` de una migracion de pnpm;
    // sin esto vitest recoge los tests que hay dentro y los cuenta dos veces.
    exclude: ['**/node_modules/**', '**/node_modules.obsoleto/**'],
  },
});
