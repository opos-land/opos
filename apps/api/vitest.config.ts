import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { defineConfig } from 'vitest/config'

const readEnv = (file: string) => (existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {})

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: { ...readEnv('.env.example'), ...readEnv('.env'), NODE_ENV: 'test' },
  },
})
