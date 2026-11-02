import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fillEnvFile, initInfra, nodeExec, nodeFs } from './infra-init.mjs'

const ROOT = '/repo'
const at = (path) => `${ROOT}/${path}`

const TEMPLATES = {
  'supabase/.env.example':
    '# hook\nSEND_EMAIL_HOOK_SECRET=\nSITE_URL=http://opos.localhost:5174\nGOOGLE_CLIENT_ID=\n',
  'apps/api/.env.example': [
    'OPOS_ENV=',
    'SEND_EMAIL_HOOK_SECRET=',
    'INVITE_SECRET=',
    'DATABASE_URL=',
    'DATABASE_GLOBAL_URL=',
    'DATABASE_MIGRATION_URL=',
    'SUPABASE_URL=',
    'SUPABASE_SECRET_KEY=',
    'PANEL_URL=http://panel.opos.localhost:5173',
    '',
  ].join('\n'),
  'packages/db/.env.example': [
    'OPOS_ENV=',
    'OPOS_APP_PASSWORD=',
    'OPOS_APP_GLOBAL_PASSWORD=',
    'DATABASE_MIGRATION_URL=',
    'SUPABASE_URL=',
    'SUPABASE_SECRET_KEY=',
    '',
  ].join('\n'),
  'apps/panel/.env.example': 'VITE_API_URL=http://api.opos.localhost:3001\n',
  'apps/portal/.env.example': 'VITE_API_URL=http://api.opos.localhost:3001\n',
}

// What `supabase status -o env` prints: a warning line, then KEY="value" lines.
const STATUS = [
  'WARN: INBUCKET_URL is deprecated and will be removed in v3, use MAILPIT_URL instead.',
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  'SECRET_KEY="sb_secret_local"',
  'PUBLISHABLE_KEY="sb_publishable_local"',
  '',
].join('\n')

/** In-memory files and a recorded list of events, for `initInfra`. */
function setup({ env = {}, files = {}, status = STATUS, templates = TEMPLATES } = {}) {
  const store = new Map(
    Object.entries({ ...templates, ...files }).map(([path, text]) => [at(path), text]),
  )
  const events = []
  const snapshots = {}
  const fs = {
    exists: (path) => store.has(path),
    read: (path) => {
      assert.ok(store.has(path), `read of a missing file ${path}`)
      return store.get(path)
    },
    write: (path, text) => {
      events.push(`write ${path.slice(ROOT.length + 1)}`)
      store.set(path, text)
    },
  }
  const exec = async (file, args, options) => {
    const line = [file, ...args].join(' ')
    events.push(`exec ${line}`)
    snapshots[line] = { files: new Map(store), options }
    return line === 'supabase status -o env' ? status : ''
  }
  const run = () => initInfra({ exec, fs, env, root: ROOT })
  const text = (path) => store.get(at(path))
  const value = (path, key) => new RegExp(`^${key}=(.*)$`, 'm').exec(text(path))?.[1]
  return { run, store, events, snapshots, text, value }
}

test('fillEnvFile keeps a value already set and fills an empty one', () => {
  assert.equal(fillEnvFile('A=\nB=x\n', 'A=kept\n', { A: 'new', B: 'y' }), 'A=kept\nB=x\n')
  assert.equal(fillEnvFile('A=\nB=\n', '', { A: 'new' }), 'A=new\nB=\n')
})

test('fillEnvFile keeps the comments, the blank lines and the order of the template', () => {
  const template = '# the key\nA=\n\n# the next\nB=1\n'
  assert.equal(fillEnvFile(template, '', { A: 'a' }), '# the key\nA=a\n\n# the next\nB=1\n')
})

test('fillEnvFile ignores a value for a key the template does not name', () => {
  assert.equal(fillEnvFile('A=\n', '', { Z: 'z' }), 'A=\n')
})

test('fillEnvFile treats a quoted empty value as set and keeps a set value as written', () => {
  assert.equal(fillEnvFile('A=\nB=\n', 'A=""\nB="x y"\n', { A: 'a', B: 'b' }), 'A=""\nB="x y"\n')
})

test('fillEnvFile keeps a developer key the template does not name, after the template', () => {
  assert.equal(fillEnvFile('A=\n', 'A=1\nMINE=2\n', {}), 'A=1\nMINE=2\n')
  assert.equal(fillEnvFile('A=', 'MINE=2\n', {}), 'A=\nMINE=2\n')
})

test('initInfra refuses OPOS_ENV dev or production and touches nothing', async () => {
  for (const OPOS_ENV of ['dev', 'production']) {
    const ctx = setup({ env: { OPOS_ENV } })
    await assert.rejects(ctx.run(), /local/)
    assert.deepEqual(ctx.events, [])
  }
})

test('initInfra runs where OPOS_ENV is local or unset', async () => {
  await setup({ env: { OPOS_ENV: 'local' } }).run()
  await setup({ env: {} }).run()
})

test('initInfra names the file a missing template would have been', async () => {
  const templates = { ...TEMPLATES }
  delete templates['supabase/.env.example']
  await assert.rejects(setup({ templates }).run(), /supabase\/\.env\.example/)
})

test('initInfra writes every .env from its template with OPOS_ENV local', async () => {
  const ctx = setup()
  await ctx.run()
  assert.equal(ctx.value('apps/api/.env', 'OPOS_ENV'), 'local')
  assert.equal(ctx.value('packages/db/.env', 'OPOS_ENV'), 'local')
  assert.equal(ctx.value('apps/api/.env', 'PANEL_URL'), 'http://panel.opos.localhost:5173')
  assert.equal(ctx.text('apps/panel/.env'), TEMPLATES['apps/panel/.env.example'])
  assert.equal(ctx.text('apps/portal/.env'), TEMPLATES['apps/portal/.env.example'])
  assert.equal(ctx.value('supabase/.env', 'SITE_URL'), 'http://opos.localhost:5174')
})

test('initInfra writes the same hook secret to supabase and the API', async () => {
  const ctx = setup()
  await ctx.run()
  const secret = ctx.value('supabase/.env', 'SEND_EMAIL_HOOK_SECRET')
  assert.match(secret, /^v1,whsec_[A-Za-z0-9+/]{43}=$/)
  assert.equal(Buffer.from(secret.slice('v1,whsec_'.length), 'base64').length, 32)
  assert.equal(ctx.value('apps/api/.env', 'SEND_EMAIL_HOOK_SECRET'), secret)
})

test('initInfra gives supabase the hook secret the API already holds', async () => {
  const kept = `v1,whsec_${Buffer.alloc(32, 7).toString('base64')}`
  const ctx = setup({ files: { 'apps/api/.env': `SEND_EMAIL_HOOK_SECRET=${kept}\n` } })
  await ctx.run()
  assert.equal(ctx.value('supabase/.env', 'SEND_EMAIL_HOOK_SECRET'), kept)
  assert.equal(ctx.value('apps/api/.env', 'SEND_EMAIL_HOOK_SECRET'), kept)
})

test('initInfra gives the API the hook secret supabase already holds', async () => {
  const kept = `v1,whsec_${Buffer.alloc(32, 9).toString('base64')}`
  const ctx = setup({ files: { 'supabase/.env': `SEND_EMAIL_HOOK_SECRET=${kept}\n` } })
  await ctx.run()
  assert.equal(ctx.value('apps/api/.env', 'SEND_EMAIL_HOOK_SECRET'), kept)
})

test('initInfra generates distinct secrets and builds the database URLs from the passwords', async () => {
  const ctx = setup()
  await ctx.run()
  const invite = ctx.value('apps/api/.env', 'INVITE_SECRET')
  const app = ctx.value('packages/db/.env', 'OPOS_APP_PASSWORD')
  const global = ctx.value('packages/db/.env', 'OPOS_APP_GLOBAL_PASSWORD')
  for (const secret of [invite, app, global]) assert.match(secret, /^[0-9a-f]{64}$/)
  assert.equal(new Set([invite, app, global]).size, 3)
  assert.equal(
    ctx.value('apps/api/.env', 'DATABASE_URL'),
    `postgres://opos_app:${app}@127.0.0.1:54322/postgres`,
  )
  assert.equal(
    ctx.value('apps/api/.env', 'DATABASE_GLOBAL_URL'),
    `postgres://opos_app_global:${global}@127.0.0.1:54322/postgres`,
  )
})

test('initInfra builds the database URLs on the port the developer moved the database to', async () => {
  const ctx = setup({ env: { SUPABASE_DB_PORT: '25432' } })
  await ctx.run()
  assert.match(ctx.value('apps/api/.env', 'DATABASE_URL'), /@127\.0\.0\.1:25432\/postgres$/)
})

test('initInfra builds the database URLs from passwords already in packages/db/.env', async () => {
  const ctx = setup({
    files: { 'packages/db/.env': 'OPOS_APP_PASSWORD=aa\nOPOS_APP_GLOBAL_PASSWORD=bb\n' },
  })
  await ctx.run()
  assert.equal(ctx.value('packages/db/.env', 'OPOS_APP_PASSWORD'), 'aa')
  assert.equal(
    ctx.value('apps/api/.env', 'DATABASE_URL'),
    'postgres://opos_app:aa@127.0.0.1:54322/postgres',
  )
  assert.equal(
    ctx.value('apps/api/.env', 'DATABASE_GLOBAL_URL'),
    'postgres://opos_app_global:bb@127.0.0.1:54322/postgres',
  )
})

test('initInfra never overwrites a value already set', async () => {
  const ctx = setup({
    files: { 'apps/api/.env': 'INVITE_SECRET=mine\nSUPABASE_SECRET_KEY=mine\nEXTRA=1\n' },
  })
  await ctx.run()
  assert.equal(ctx.value('apps/api/.env', 'INVITE_SECRET'), 'mine')
  assert.equal(ctx.value('apps/api/.env', 'SUPABASE_SECRET_KEY'), 'mine')
  assert.equal(ctx.value('apps/api/.env', 'EXTRA'), '1')
})

test('initInfra runs in order: env files, secrets, start, status', async () => {
  const ctx = setup()
  await ctx.run()
  assert.deepEqual(
    ctx.events.filter((event) => event.startsWith('exec ')),
    ['exec supabase start', 'exec supabase status -o env'],
  )
  const start = ctx.snapshots['supabase start'].files
  assert.match(start.get(at('supabase/.env')), /SEND_EMAIL_HOOK_SECRET=v1,whsec_/)
  assert.match(start.get(at('apps/api/.env')), /INVITE_SECRET=[0-9a-f]{64}/)
  assert.match(start.get(at('packages/db/.env')), /OPOS_APP_PASSWORD=[0-9a-f]{64}/)
  assert.match(start.get(at('apps/api/.env')), /SUPABASE_SECRET_KEY=\n/)
  const status = ctx.snapshots['supabase status -o env'].files
  assert.match(status.get(at('apps/api/.env')), /SUPABASE_SECRET_KEY=\n/)
  assert.ok(
    ctx.events.indexOf('exec supabase start') < ctx.events.lastIndexOf('write apps/api/.env'),
  )
})

test('initInfra runs the CLI in the repository root with the caller environment', async () => {
  const ctx = setup({ env: { SUPABASE_DB_PORT: '25432' } })
  await ctx.run()
  for (const { options } of Object.values(ctx.snapshots)) {
    assert.equal(options.cwd, ROOT)
    assert.equal(options.env.SUPABASE_DB_PORT, '25432')
  }
})

test('initInfra writes the keys and addresses status reports to the API and packages/db', async () => {
  const ctx = setup()
  await ctx.run()
  for (const file of ['apps/api/.env', 'packages/db/.env']) {
    assert.equal(ctx.value(file, 'SUPABASE_URL'), 'http://127.0.0.1:54321')
    assert.equal(ctx.value(file, 'SUPABASE_SECRET_KEY'), 'sb_secret_local')
    assert.equal(
      ctx.value(file, 'DATABASE_MIGRATION_URL'),
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    )
  }
})

test('initInfra stops when status does not report a key it needs', async () => {
  const status = 'API_URL="http://127.0.0.1:54321"\nDB_URL="postgresql://x"\n'
  await assert.rejects(setup({ status }).run(), /SECRET_KEY/)
})

test('initInfra never runs supabase link and writes no project id or access token', async () => {
  const ctx = setup({ env: { SUPABASE_PROJECT_ID: 'zzprojectzz', SUPABASE_ACCESS_TOKEN: 'sbp_x' } })
  await ctx.run()
  for (const event of ctx.events) assert.doesNotMatch(event, /\blink\b/)
  for (const [path, text] of ctx.store) {
    assert.doesNotMatch(text, /PROJECT_ID|PROJECT_REF|ACCESS_TOKEN|sbp_|zzprojectzz/, path)
  }
})

test('a second run changes nothing', async () => {
  const ctx = setup()
  await ctx.run()
  const before = new Map(ctx.store)
  ctx.events.length = 0
  await ctx.run()
  assert.deepEqual(ctx.store, before)
  assert.deepEqual(
    ctx.events.filter((event) => event.startsWith('write ')),
    [],
  )
})

test('nodeFs reads, writes and checks files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'infra-init-'))
  try {
    const file = join(dir, 'a.env')
    assert.equal(nodeFs.exists(file), false)
    nodeFs.write(file, 'A=1\n')
    assert.equal(nodeFs.exists(file), true)
    assert.equal(nodeFs.read(file), 'A=1\n')
    assert.equal(readFileSync(file, 'utf8'), 'A=1\n')
    writeFileSync(file, 'B=2\n')
    assert.equal(nodeFs.read(file), 'B=2\n')
    assert.ok(existsSync(file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('nodeExec returns what the command printed, in the given directory and environment', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'infra-init-'))
  try {
    const out = await nodeExec(
      process.execPath,
      ['-e', 'console.log(process.cwd() + "|" + process.env.INFRA_INIT_PROBE)'],
      { cwd: dir, env: { ...process.env, INFRA_INIT_PROBE: 'yes' } },
    )
    assert.match(out, /infra-init-.*\|yes\n$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('nodeExec rejects when the command fails or does not exist', async () => {
  const options = { cwd: tmpdir(), env: process.env }
  await assert.rejects(
    nodeExec(process.execPath, ['-e', 'process.exit(3)'], options),
    /exited with 3/,
  )
  await assert.rejects(nodeExec('opos-no-such-command-xyz', [], options), /ENOENT/)
})
