#!/usr/bin/env node
// `pnpm local:links`: prints the addresses of the local stack in a table, with the command that
// starts each. The applications' addresses come from apps/api/.env, which `pnpm stack:init`
// writes, and Supabase's ports from supabase/config.toml, so a moved port shows where it moved.
// It prints addresses only, never a key or a password.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The `port` of a `[section]` of supabase/config.toml, undefined when it sets none. */
function portOf(config, section) {
  const body = config.split(/^\[/m).find((part) => part.startsWith(`${section}]`))
  return body && /^port\s*=\s*(\d+)\s*$/m.exec(body)?.[1]
}

/** [service, address, root script that starts it] for each address `env` and `config` set. */
export function links(env, config) {
  const local = (port, path = '') => port && `http://127.0.0.1:${port}${path}`
  const db = portOf(config, 'db')
  const api = env.API_URL
  const rows = [
    ['Panel', env.PANEL_URL, 'local:start'],
    ['Portal', env.PORTAL_URL, 'local:start'],
    ['Admin', env.ADMIN_URL, 'local:start'],
    ['API', api, 'local:start'],
    ['API health', api && `${api.replace(/\/$/, '')}/health`, 'local:start'],
    ['Supabase Studio', local(portOf(config, 'studio')), 'stack:up'],
    ['Mailpit', local(portOf(config, 'local_smtp')), 'stack:up'],
    ['Supabase Auth', env.SUPABASE_URL && `${env.SUPABASE_URL}/auth/v1`, 'stack:up'],
    ['Postgres', db && `postgresql://127.0.0.1:${db}/postgres`, 'stack:up'],
    ['S3 bucket', env.S3_ENDPOINT, 'stack:up'],
    ['imgproxy', env.IMGPROXY_URL, 'stack:up'],
  ]
  return rows.filter(([, address]) => address)
}

/** `rows` under a header, each column padded to its widest cell. */
export function render(rows) {
  const table = [
    ['Service', 'Address', 'Started by'],
    ...rows.map(([name, address, script]) => [name, address, `pnpm ${script}`]),
  ]
  const widths = [0, 1].map((column) => Math.max(...table.map((row) => row[column].length)))
  return table
    .map(([name, address, script]) =>
      [name.padEnd(widths[0]), address.padEnd(widths[1]), script].join('  '),
    )
    .join('\n')
}

/** `root`, a checkout of its own, and `log(line)` are injected by the tests. */
export function main(_argv, { root = repositoryRoot, log = console.log } = {}) {
  const envFile = join(root, 'apps/api/.env')
  if (!existsSync(envFile)) {
    log('apps/api/.env is missing; run pnpm stack:init first')
    return 1
  }
  const env = parseEnv(readFileSync(envFile, 'utf8'))
  const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8')
  log(render(links(env, config)))
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
