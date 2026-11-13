import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

/**
 * The working dev values of `.env.example`, which the dev server and the tests use for every
 * `VITE_*` variable that `.env` or the environment does not set. A production build never reads
 * them: its addresses come from the environment it is built in.
 */
export function devEnvDefaults(root: string): Record<string, string> {
  const file = join(root, '.env.example')
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    Object.entries(parseEnv(readFileSync(file, 'utf8'))).filter(
      (entry): entry is [string, string] => entry[0].startsWith('VITE_') && entry[1] !== undefined,
    ),
  )
}

/**
 * The interface and port the dev server binds: OPOS_ADMIN_HOST and OPOS_ADMIN_PORT, from the
 * environment or `.env`, move them; an empty value keeps the loopback interface and port 5175. The
 * browser still opens PANEL_URL of the API, whose `*.localhost` name the browser resolves itself.
 */
export function devServerAddress(env: Record<string, string | undefined>): {
  host: string
  port: number
} {
  const host = env.OPOS_ADMIN_HOST?.trim() || '127.0.0.1'
  const rawPort = env.OPOS_ADMIN_PORT?.trim() || '5175'
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`OPOS_ADMIN_PORT must be a port from 1 to 65535, got ${rawPort}`)
  }
  return { host, port }
}
