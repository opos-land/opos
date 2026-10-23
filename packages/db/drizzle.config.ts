import { defineConfig } from 'drizzle-kit'
import { migrationUrl } from './src/migration-url'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  schemaFilter: ['public'],
  dbCredentials: { url: migrationUrl() },
})
