import { existsSync, readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vitest/config'

const readEnv = (file: string) => (existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {})

const STORAGE_TESTS = 'test/files.test.ts'

/**
 * The test files that write the admin log and count its entries. The log is one for every tenant,
 * so two of them at once would count each other's.
 */
const ADMIN_LOG_TESTS = ['test/admin.test.ts', 'test/admin-profiles.test.ts']

/**
 * Every worker runs a whole API with connection pools of its own, and the local database serves
 * 100 connections: four leave room for the stack's own and for a running `pnpm local`. More
 * workers would save no time, since the run lasts as long as its longest file.
 */
const MAX_WORKERS = 4

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
    // One fewer than the cores, as vitest counts them itself, and never more than MAX_WORKERS.
    // VITEST_MAX_WORKERS replaces it.
    maxWorkers: Math.max(1, Math.min(MAX_WORKERS, availableParallelism() - 1)),
    // The tests of file storage sweep the whole bucket as if a day had passed, which would take
    // the bytes of an upload another test is in the middle of: they run once the others are done.
    // The files of the admin log run after them, one at a time. Each has a group of its own
    // rather than a project with `fileParallelism` off, which VITEST_MAX_WORKERS of the pre-push
    // hook would turn back on: two groups never run at once, whatever the workers.
    projects: [
      {
        extends: true,
        test: {
          name: 'api',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: [STORAGE_TESTS, ...ADMIN_LOG_TESTS],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: { name: 'storage', include: [STORAGE_TESTS], sequence: { groupOrder: 1 } },
      },
      ...ADMIN_LOG_TESTS.map((file, index) => ({
        extends: true as const,
        test: {
          name: basename(file, '.test.ts'),
          include: [file],
          sequence: { groupOrder: 2 + index },
        },
      })),
    ],
  },
})
