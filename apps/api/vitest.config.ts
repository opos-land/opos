import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vitest/config'

const readEnv = (file: string) => (existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {})

export default defineConfig({
  // The email messages in @opos/i18n/emails are written with Lingui macros (PLAN.md 6).
  plugins: [
    lingui({
      macroTransform: true,
      configPath: fileURLToPath(import.meta.resolve('@opos/i18n/lingui.config')),
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    env: { ...readEnv('.env.example'), ...readEnv('.env'), NODE_ENV: 'test' },
    // A test signs in through the real stack several times and waits for its email; a hook starts
    // the API (PLAN.md 15.1).
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
})
