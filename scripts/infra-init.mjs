#!/usr/bin/env node
// `pnpm infra:init` (docs/PLAN.md, 12): writes the .env files from their templates, fills the empty
// secrets, creates the local signing key, starts the Supabase CLI's local stack, writes the keys and
// addresses it reports and sets the database roles. Safe to run again: a value already set is never
// overwritten. It runs on the local stack only and never links a hosted project.

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Each directory holds a .env.example and gets a .env.
const ENV_DIRS = ['supabase', 'apps/api', 'packages/db', 'apps/panel', 'apps/portal']

const ADDRESS_KEYS = ['API_URL', 'PANEL_URL', 'PORTAL_URL', 'VITE_API_URL']

// The database URLs of each .env; a value already set is never overwritten, so an old one stays.
const DATABASE_KEYS = {
  'apps/api': ['DATABASE_URL', 'DATABASE_GLOBAL_URL', 'DATABASE_MIGRATION_URL'],
  'packages/db': ['DATABASE_MIGRATION_URL'],
}

const isSet = (value) => (value ?? '').trim() !== ''

/** The port of a database URL, with Postgres's own as the default; null for what is no URL. */
function databasePort(value) {
  try {
    return new URL(value).port || '5432'
  } catch {
    return null
  }
}

const KEY_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/
// What may follow `=` on the line of an empty value: nothing, a quoted nothing, and a comment.
const EMPTY_REST = /^\s*(?:(["'`])\1)?(?:\s*(#.*))?$/

/** The keys of a template with the comment lines right above each and the value it sets. */
function templateKeys(template) {
  const parsed = parseEnv(template)
  const lines = template.split('\n')
  const keys = []
  lines.forEach((line, idx) => {
    const match = KEY_LINE.exec(line)
    if (!match) return
    let start = idx
    while (start > 0 && lines[start - 1].trimStart().startsWith('#')) start--
    keys.push({ key: match[1], lines: lines.slice(start, idx + 1), value: parsed[match[1]] })
  })
  return keys
}

/** `text` with the empty assignment of `key` given `value`; the rest of the line stays. */
function fillAssignment(text, key, value) {
  const lines = text.split('\n')
  const target = new RegExp(`^(\\s*(?:export\\s+)?${key}\\s*=)([^\\r]*)(\\r?)$`)
  for (let idx = lines.length - 1; idx >= 0; idx--) {
    const match = target.exec(lines[idx])
    const rest = match && EMPTY_REST.exec(match[2])
    if (!rest) continue
    lines[idx] = `${match[1]}${value}${rest[2] ? ` ${rest[2]}` : ''}${match[3]}`
    break
  }
  return lines.join('\n')
}

/**
 * `existing` edited in place: an empty value of a key the template names is filled, from the
 * template when it sets one and else from `values`, and a template key the file lacks is appended
 * with its comment. Every other byte stays, comments, `export` lines, multi-line values and keys
 * the template does not name included; a value `parseEnv` reads as set is never touched. An
 * empty `existing` gives the template, filled.
 */
export function fillEnvFile(template, existing, values) {
  let text = existing.trim() === '' ? template : existing
  const present = parseEnv(text)
  const appended = []
  for (const { key, lines, value } of templateKeys(template)) {
    let fill = null
    if (isSet(value)) fill = value
    else if (Object.hasOwn(values, key)) fill = values[key]
    // parseEnv names an empty `export KEY=` line `export KEY`
    const current = present[key] ?? present[`export ${key}`]
    if (current !== undefined) {
      if (!isSet(current) && fill !== null) text = fillAssignment(text, key, fill)
    } else if (fill === null) {
      appended.push(...lines)
    } else {
      appended.push(...lines.slice(0, -1), `${key}=${fill}`)
    }
  }
  if (appended.length === 0) return text
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const added = appended.map((line) => line.replace(/\r$/, '')).join(eol)
  return `${text.endsWith('\n') ? text : `${text}${eol}`}${added}${eol}`
}

export const nodeFs = {
  exists: (path) => existsSync(path),
  read: (path) => readFileSync(path, 'utf8'),
  write: (path, text) => writeFileSync(path, text),
}

/**
 * Runs a command, passes its errors through to the terminal and returns what it printed. A failed
 * command's stdout is dropped unless `showOutputOnFailure` is set: `supabase start` prints keys.
 */
export function nodeExec(file, args, { cwd, env, showOutputOnFailure = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      const command = `${file} ${args.join(' ')}`
      if (code !== 0 && showOutputOnFailure) process.stderr.write(out)
      if (code === 0) resolve(out)
      else if (signal === null) reject(new Error(`${command} exited with ${code}`))
      else if (signal === 'SIGKILL') {
        reject(
          new Error(
            `${command} was killed by SIGKILL; run it through mise (mise exec -- pnpm infra:init), since a binary installed by brew is killed by macOS when its signature is invalid`,
          ),
        )
      } else reject(new Error(`${command} was killed by ${signal}`))
    })
  })
}

/** What `supabase status -o env` reports: KEY="value" lines among warnings. */
function parseStatus(output) {
  const lines = output.split('\n').filter((line) => /^[A-Z0-9_]+=/.test(line))
  return parseEnv(lines.join('\n'))
}

/** `exec(file, args, { cwd, env, showOutputOnFailure })` returns stdout; `fs` has `exists`, `read` and `write`. */
export async function initInfra({
  exec = nodeExec,
  fs = nodeFs,
  env = process.env,
  root = ROOT,
  warn = console.warn,
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
  const known = (dir, key) => parseEnv(current(dir))[key]

  // Before anything is written: two hook secrets that differ, and addresses that left the template
  const hook = ['supabase', 'apps/api'].map((dir) => known(dir, 'SEND_EMAIL_HOOK_SECRET'))
  if (hook.every(isSet) && hook[0] !== hook[1]) {
    throw new Error(
      'SEND_EMAIL_HOOK_SECRET differs between supabase/.env and apps/api/.env; make them equal',
    )
  }
  for (const dir of ENV_DIRS) {
    const wanted = parseEnv(templates.get(dir))
    for (const key of ADDRESS_KEYS) {
      if (isSet(known(dir, key)) && isSet(wanted[key]) && known(dir, key) !== wanted[key]) {
        warn(
          `${dir}/.env: ${key} differs from ${dir}/.env.example; change it by hand if the address is not meant to differ`,
        )
      }
    }
  }

  /** Writes `dir/.env` filled with `values`, only when that changes it. */
  const fill = (dir, values) => {
    const before = current(dir)
    const after = fillEnvFile(templates.get(dir), before, values)
    if (after !== before || !fs.exists(file(dir, '.env'))) fs.write(file(dir, '.env'), after)
  }

  // 1. every missing .env, from its template
  for (const dir of ENV_DIRS) fill(dir, { OPOS_ENV: 'local' })

  // 2. the empty secrets; a secret one file already holds is the one the others get
  const pick = (dirs, key, generate, fallback = () => undefined) =>
    dirs.map((dir) => known(dir, key)).find(isSet) ?? fallback() ?? generate()
  // The password inside a database URL of apps/api/.env: a rerun that finds packages/db/.env gone
  // must not give the roles passwords that file's URLs do not hold.
  const passwordIn = (key) => () => {
    try {
      const { password } = new URL(known('apps/api', key))
      return password === '' ? undefined : decodeURIComponent(password)
    } catch {
      return undefined
    }
  }
  const hex = () => randomBytes(32).toString('hex')
  const hookSecret = pick(
    ['apps/api', 'supabase'],
    'SEND_EMAIL_HOOK_SECRET',
    () => `v1,whsec_${randomBytes(32).toString('base64')}`,
  )
  const appPassword = pick(['packages/db'], 'OPOS_APP_PASSWORD', hex, passwordIn('DATABASE_URL'))
  const appGlobalPassword = pick(
    ['packages/db'],
    'OPOS_APP_GLOBAL_PASSWORD',
    hex,
    passwordIn('DATABASE_GLOBAL_URL'),
  )
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

  // 3. the local signing key: config.toml names the file, and the CLI refuses when it is missing.
  // A file an earlier run left without a key gets one, so a failed run does not stick.
  const signingKeys = file('supabase', 'signing_keys.json')
  if (!fs.exists(signingKeys)) fs.write(signingKeys, '[]\n')
  if (fs.read(signingKeys).trim() === '[]') {
    await exec('supabase', ['gen', 'signing-key', '--algorithm', 'ES256', '--append'], {
      cwd: root,
      env,
    })
  }

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

  // Before db:roles, which such a URL makes fail with an authentication error of whatever holds
  // that port. The key alone: a URL holds a password.
  for (const [dir, keys] of Object.entries(DATABASE_KEYS)) {
    for (const key of keys) {
      if (isSet(known(dir, key)) && databasePort(known(dir, key)) !== databasePort(status.DB_URL)) {
        warn(
          `${dir}/.env: ${key} is on another port than the local stack reports; a checkout from before this stack removes its .env files and runs pnpm infra:init (docs/PLAN.md, 12)`,
        )
      }
    }
  }

  // 5. the database roles, with the passwords and the address written above (docs/PLAN.md, 4.6)
  await exec('pnpm', ['db:roles'], { cwd: root, env, showOutputOnFailure: true })
}

/* node:coverage ignore next 6 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initInfra().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
