import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

// The addresses and credentials of the stack under test come from the API's own configuration:
// apps/api/.env.example, overridden by apps/api/.env when present, as in the API tests
// (PLAN.md 15.1). Mailpit's port is the shell's OPOS_MAILPIT_PORT (PLAN.md 12).

export const API_DIR = fileURLToPath(new URL('../../apps/api/', import.meta.url))

function readEnv(name: string): Record<string, string> {
  const file = `${API_DIR}${name}`
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    Object.entries(parseEnv(readFileSync(file, 'utf8'))).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
}

/** The API's environment, the one the API under test runs with. */
export const apiEnv: Record<string, string> = { ...readEnv('.env.example'), ...readEnv('.env') }

function required(name: string) {
  const value = apiEnv[name]
  if (!value) throw new Error(`${name} is missing from apps/api/.env.example`)
  return value
}

export const stack = {
  api: required('API_URL'),
  panel: required('PANEL_URL'),
  portal: required('PORTAL_URL'),
  auth: required('AUTH_URL'),
  mailpit: `http://localhost:${process.env.OPOS_MAILPIT_PORT ?? '8025'}`,
  databaseUrl: required('DATABASE_MIGRATION_URL'),
  serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
}

/** The port of an address, as a dev server binds it. */
export const portOf = (url: string) => {
  const { port, protocol } = new URL(url)
  return port || (protocol === 'https:' ? '443' : '80')
}
