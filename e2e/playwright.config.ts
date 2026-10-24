import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { API_DIR, apiEnv, portOf, stack } from './fixtures/stack'

// E2E through the UI of the panel and the portal against the full stack (PLAN.md 15.2). The
// infrastructure comes from `pnpm infra:up`, migrations and the seed run before; the three
// applications start here, or a running `pnpm dev` is reused outside CI.

const CI = Boolean(process.env.CI)
const app = (name: string) => fileURLToPath(new URL(`../apps/${name}/`, import.meta.url))

// The dev servers bind the ports of the addresses the API allows (PLAN.md 12, Ports).
const devServerEnv = {
  ...(process.env as Record<string, string>),
  OPOS_PANEL_PORT: portOf(stack.panel),
  OPOS_PORTAL_PORT: portOf(stack.portal),
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
    // The portal on a phone: the scenarios tagged @mobile (PLAN.md 15.2).
    { name: 'mobile', use: { ...devices['Pixel 7'], locale: 'en-US' }, grep: /@mobile/ },
  ],
  webServer: [
    {
      // The bundle production runs, built from the sources under test.
      command: 'pnpm run build && pnpm run start',
      cwd: API_DIR,
      url: new URL('/health', stack.api).toString(),
      env: { ...(process.env as Record<string, string>), ...apiEnv },
      reuseExistingServer: !CI,
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
  ],
})
