import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3210);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.tmp/playwright-report' }]],
  outputDir: '.tmp/playwright-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    // El tema por defecto de la aplicación es el oscuro: las capturas y los
    // tests deben reflejarlo. El claro se prueba a propósito en ajustes.
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'movil',
      use: { ...devices['Pixel 7'] },
      testIgnore: /desktop\.spec\.ts$/,
    },
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testMatch: /(desktop|accesibilidad)\.spec\.ts$/,
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
