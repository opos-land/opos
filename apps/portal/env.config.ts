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
