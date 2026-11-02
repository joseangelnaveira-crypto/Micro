import { defineConfig } from '@playwright/test';

// Prueba de humo de la app: usa el Edge/Chrome ya instalado (no descarga navegadores).
// Necesita en .env.local: E2E_EMAIL y E2E_PASSWORD de un usuario aprobado (de pruebas).
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  retries: 0,
  workers: 1, // todas las pruebas usan el mismo usuario: en serie
  use: {
    baseURL: 'http://localhost:3000',
    channel: 'msedge',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
