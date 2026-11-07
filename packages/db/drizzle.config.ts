import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'
import { migrationUrl } from './src/migration-url'

// packages/db/.env, which pnpm infra:init writes; the environment wins over it.
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  schemaFilter: ['public'],
  dbCredentials: { url: migrationUrl() },
})
