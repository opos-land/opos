import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vitest/config'

const readEnv = (file: string) => (existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {})

const STORAGE_TESTS = 'test/files.test.ts'

export default defineConfig({
  // The email messages in @opos/i18n/emails are written with Lingui macros.
  plugins: [
    lingui({
      macroTransform: true,
      configPath: fileURLToPath(import.meta.resolve('@opos/i18n/lingui.config')),
    }),
  ],
  test: {
    env: { ...readEnv('.env.example'), ...readEnv('.env'), NODE_ENV: 'test' },
    // A test signs in through the real stack several times and waits for its email; a hook starts
    // the API.
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // The tests of file storage sweep the whole bucket as if a day had passed, which would take
    // the bytes of an upload another test is in the middle of: they run once the others are done.
    projects: [
      {
        extends: true,
        test: {
          name: 'api',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: [STORAGE_TESTS],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: { name: 'storage', include: [STORAGE_TESTS], sequence: { groupOrder: 1 } },
      },
    ],
  },
})
