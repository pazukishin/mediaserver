import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [react()],
  // La versión vive en un único sitio (package.json) y se inyecta en el bundle.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
  },
});
