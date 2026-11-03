import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { migrationUrl } from '@opos/db'

// The addresses and credentials of the stack under test come from the API's own configuration,
// apps/api/.env over its template, as in the API tests (PLAN.md 15.1). Mailpit's port is the shell's
// SUPABASE_LOCAL_SMTP_PORT (PLAN.md 12).

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
  if (!value) throw new Error(`${name} is missing from apps/api/.env; run pnpm infra:init`)
  return value
}

export const stack = {
  api: required('API_URL'),
  panel: required('PANEL_URL'),
  portal: required('PORTAL_URL'),
  auth: `${required('SUPABASE_URL').replace(/\/+$/, '')}/auth/v1`,
  mailpit: `http://localhost:${process.env.SUPABASE_LOCAL_SMTP_PORT ?? '54324'}`,
  databaseUrl: migrationUrl(apiEnv),
  secretKey: required('SUPABASE_SECRET_KEY'),
}

/** The port of an address, as a dev server binds it. */
export const portOf = (url: string) => {
  const { port, protocol } = new URL(url)
  return port || (protocol === 'https:' ? '443' : '80')
}
