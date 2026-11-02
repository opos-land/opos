#!/usr/bin/env node
// `pnpm infra:init` (docs/PLAN.md, 12): writes the .env files from their templates, fills the empty
// secrets, starts the Supabase CLI's local stack and writes the keys and addresses it reports.
// Safe to run again: a value already set is never overwritten. It runs on the local stack only and
// never links a hosted project.

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Each directory holds a .env.example and gets a .env.
const ENV_DIRS = ['supabase', 'apps/api', 'packages/db', 'apps/panel', 'apps/portal']

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/

/** The `KEY=value` lines of an env file, as a map of key to the value as written. */
function assignments(text) {
  const found = new Map()
  for (const line of text.split('\n')) {
    const match = ASSIGNMENT.exec(line)
    if (match) found.set(match[1], match[2])
  }
  return found
}

const isSet = (value) => (value ?? '').trim() !== ''

/**
 * The text of an env file: the template, with an empty value taken from `existing` when that holds
 * one, or else from `values`. A value set in `existing` or in the template is never overwritten, and
 * a key of `existing` the template does not name stays, after the template.
 */
export function fillEnvFile(template, existing, values) {
  const current = assignments(existing)
  const named = new Set()
  const lines = template.split('\n').map((line) => {
    const match = ASSIGNMENT.exec(line)
    if (!match) return line
    const [, key, value] = match
    named.add(key)
    if (isSet(current.get(key))) return `${key}=${current.get(key)}`
    if (isSet(value) || !Object.hasOwn(values, key)) return line
    return `${key}=${values[key]}`
  })
  const extra = [...current].filter(([key]) => !named.has(key)).map(([key, v]) => `${key}=${v}`)
  if (extra.length === 0) return lines.join('\n')
  const body = lines.at(-1) === '' ? lines.slice(0, -1) : lines
  return [...body, ...extra, ''].join('\n')
}

export const nodeFs = {
  exists: (path) => existsSync(path),
  read: (path) => readFileSync(path, 'utf8'),
  write: (path, text) => writeFileSync(path, text),
}

/** Runs a command, passes its errors through to the terminal and returns what it printed. */
export function nodeExec(file, args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`${file} ${args.join(' ')} exited with ${code}`))
    })
  })
}

/** What `supabase status -o env` reports: KEY="value" lines among warnings. */
function parseStatus(output) {
  const lines = output.split('\n').filter((line) => /^[A-Z0-9_]+=/.test(line))
  return parseEnv(lines.join('\n'))
}

/** `exec(file, args, { cwd, env })` returns stdout; `fs` has `exists`, `read` and `write`. */
export async function initInfra({
  exec = nodeExec,
  fs = nodeFs,
  env = process.env,
  root = ROOT,
} = {}) {
  if (env.OPOS_ENV && env.OPOS_ENV !== 'local') {
    throw new Error(
      `pnpm infra:init sets up the local stack only; OPOS_ENV is ${env.OPOS_ENV}, expected local`,
    )
  }

  const file = (dir, name) => join(root, dir, name)
  const templates = new Map(
    ENV_DIRS.map((dir) => {
      const path = file(dir, '.env.example')
      if (!fs.exists(path)) throw new Error(`${dir}/.env.example is missing`)
      return [dir, fs.read(path)]
    }),
  )
  const current = (dir) => (fs.exists(file(dir, '.env')) ? fs.read(file(dir, '.env')) : '')
  const known = (dir, key) => assignments(current(dir)).get(key)

  /** Writes `dir/.env` filled with `values`, only when that changes it. */
  const fill = (dir, values) => {
    const before = current(dir)
    const after = fillEnvFile(templates.get(dir), before, values)
    if (after !== before || !fs.exists(file(dir, '.env'))) fs.write(file(dir, '.env'), after)
  }

  // 1. every missing .env, from its template
  for (const dir of ENV_DIRS) fill(dir, { OPOS_ENV: 'local' })

  // 2. the empty secrets; a secret one file already holds is the one the others get
  const pick = (dirs, key, generate) => dirs.map((dir) => known(dir, key)).find(isSet) ?? generate()
  const hex = () => randomBytes(32).toString('hex')
  const hookSecret = pick(
    ['apps/api', 'supabase'],
    'SEND_EMAIL_HOOK_SECRET',
    () => `v1,whsec_${randomBytes(32).toString('base64')}`,
  )
  const appPassword = pick(['packages/db'], 'OPOS_APP_PASSWORD', hex)
  const appGlobalPassword = pick(['packages/db'], 'OPOS_APP_GLOBAL_PASSWORD', hex)
  const dbPort = env.SUPABASE_DB_PORT ?? '54322'
  const databaseUrl = (role, password) =>
    `postgres://${role}:${password}@127.0.0.1:${dbPort}/postgres`
  fill('supabase', { SEND_EMAIL_HOOK_SECRET: hookSecret })
  fill('apps/api', {
    SEND_EMAIL_HOOK_SECRET: hookSecret,
    INVITE_SECRET: pick(['apps/api'], 'INVITE_SECRET', hex),
    DATABASE_URL: databaseUrl('opos_app', appPassword),
    DATABASE_GLOBAL_URL: databaseUrl('opos_app_global', appGlobalPassword),
  })
  fill('packages/db', {
    OPOS_APP_PASSWORD: appPassword,
    OPOS_APP_GLOBAL_PASSWORD: appGlobalPassword,
  })

  // 4. the local stack, and the keys and addresses it reports (docs/PLAN.md, 12)
  await exec('supabase', ['start'], { cwd: root, env })
  const status = parseStatus(await exec('supabase', ['status', '-o', 'env'], { cwd: root, env }))
  for (const key of ['API_URL', 'DB_URL', 'SECRET_KEY']) {
    if (!isSet(status[key])) throw new Error(`supabase status reports no ${key}`)
  }
  const reported = {
    SUPABASE_URL: status.API_URL,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
    DATABASE_MIGRATION_URL: status.DB_URL,
  }
  fill('apps/api', reported)
  fill('packages/db', reported)
}

/* node:coverage ignore next 6 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initInfra().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
