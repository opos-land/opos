import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { API_DIR, apiEnv, portOf, stack } from './fixtures/stack'

// E2E through the UI of the panel, the portal and the admin application against the full stack.
// The infrastructure comes from `pnpm infra:init`, migrations and the seed run before; the four
// applications start here. The API starts fresh on every run, so its in-memory rate-limit
// counters start from zero; outside CI a running frontend is reused.

const CI = Boolean(process.env.CI)
const app = (name: string) => fileURLToPath(new URL(`../apps/${name}/`, import.meta.url))

// The dev servers bind the ports of the addresses the API allows, and call the API under test.
const devServerEnv = {
  ...(process.env as Record<string, string>),
  VITE_API_URL: stack.api,
  OPOS_PANEL_PORT: portOf(stack.panel),
  OPOS_PORTAL_PORT: portOf(stack.portal),
  OPOS_ADMIN_PORT: portOf(stack.admin),
}

export default defineConfig({
  testDir: 'specs',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    locale: 'en-US',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], locale: 'en-US' } },
    // The portal on a phone: the scenarios tagged @mobile.
    { name: 'mobile', use: { ...devices['Pixel 7'], locale: 'en-US' }, grep: /@mobile/ },
  ],
  webServer: [
    {
      // The bundle production runs, built from the sources under test.
      command: 'pnpm run build && pnpm run start',
      cwd: API_DIR,
      url: new URL('/health', stack.api).toString(),
      env: { ...(process.env as Record<string, string>), ...apiEnv },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm run dev',
      cwd: app('panel'),
      url: stack.panel,
      env: devServerEnv,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm run dev',
      cwd: app('portal'),
      url: stack.portal,
      env: devServerEnv,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm run dev',
      cwd: app('admin'),
      url: stack.admin,
      env: devServerEnv,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
})
