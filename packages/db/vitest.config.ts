import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// packages/db/.env, which pnpm infra:init writes (PLAN.md 11); the environment wins over it.
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
  },
})
