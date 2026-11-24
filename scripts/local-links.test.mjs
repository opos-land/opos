import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { links, main, render } from './local-links.mjs'

const fixtures = []
after(() => {
  for (const root of fixtures) rmSync(root, { recursive: true, force: true })
})

const CONFIG = `project_id = "opos"

[api]
enabled = false
port = 54321

[db]
port = 54322
shadow_port = 54320

[db.migrations]
enabled = false

[studio]
enabled = true
port = 54323

[local_smtp]
enabled = true
port = 54324
smtp_port = 54325
`

const ENV = {
  API_URL: 'http://api.opos.localhost:3001',
  PANEL_URL: 'http://panel.opos.localhost:5173',
  PORTAL_URL: 'http://opos.localhost:5174',
  ADMIN_URL: 'http://admin.opos.localhost:5175',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  S3_ENDPOINT: 'http://127.0.0.1:54330',
  IMGPROXY_URL: 'http://127.0.0.1:54331',
  SUPABASE_SECRET_KEY: 'sb_secret_never_printed',
  DATABASE_URL: 'postgresql://opos_app:password@127.0.0.1:54322/postgres',
}

function checkout({ env, config = CONFIG }) {
  const root = mkdtempSync(join(tmpdir(), 'local-links-'))
  fixtures.push(root)
  mkdirSync(join(root, 'apps/api'), { recursive: true })
  mkdirSync(join(root, 'supabase'), { recursive: true })
  if (env !== undefined) {
    const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`)
    writeFileSync(join(root, 'apps/api/.env'), `${lines.join('\n')}\n`)
  }
  writeFileSync(join(root, 'supabase/config.toml'), config)
  return root
}

test('lists every address of the local stack with the command that starts it', () => {
  assert.deepEqual(links(ENV, CONFIG), [
    ['Panel', 'http://panel.opos.localhost:5173', 'local:start'],
    ['Portal', 'http://opos.localhost:5174', 'local:start'],
    ['Admin', 'http://admin.opos.localhost:5175', 'local:start'],
    ['API', 'http://api.opos.localhost:3001', 'local:start'],
    ['API health', 'http://api.opos.localhost:3001/health', 'local:start'],
    ['Supabase Studio', 'http://127.0.0.1:54323', 'stack:up'],
    ['Mailpit', 'http://127.0.0.1:54324', 'stack:up'],
    ['Supabase Auth', 'http://127.0.0.1:54321/auth/v1', 'stack:up'],
    ['Postgres', 'postgresql://127.0.0.1:54322/postgres', 'stack:up'],
    ['S3 bucket', 'http://127.0.0.1:54330', 'stack:up'],
    ['imgproxy', 'http://127.0.0.1:54331', 'stack:up'],
  ])
})

test('follows a port moved in apps/api/.env or supabase/config.toml', () => {
  const rows = links(
    { ...ENV, PANEL_URL: 'http://panel.opos.localhost:6173', S3_ENDPOINT: 'http://127.0.0.1:6330' },
    CONFIG.replace('port = 54323', 'port = 6323'),
  )
  assert.deepEqual(rows[0], ['Panel', 'http://panel.opos.localhost:6173', 'local:start'])
  assert.deepEqual(rows[5], ['Supabase Studio', 'http://127.0.0.1:6323', 'stack:up'])
  assert.deepEqual(rows[9], ['S3 bucket', 'http://127.0.0.1:6330', 'stack:up'])
})

test('leaves out an address that is not set, and a trailing slash of the API', () => {
  const rows = links(
    { API_URL: 'http://api.opos.localhost:3001/', ADMIN_URL: '' },
    '[api]\nport = 54321\n',
  )
  assert.deepEqual(rows, [
    ['API', 'http://api.opos.localhost:3001/', 'local:start'],
    ['API health', 'http://api.opos.localhost:3001/health', 'local:start'],
  ])
})

test('pads the columns into a table under a header', () => {
  assert.deepEqual(
    render([
      ['Panel', 'http://panel', 'local:start'],
      ['Supabase Studio', 'http://studio', 'stack:up'],
    ]).split('\n'),
    [
      'Service          Address        Started by',
      'Panel            http://panel   pnpm local:start',
      'Supabase Studio  http://studio  pnpm stack:up',
    ],
  )
})

test('prints the table of the checkout and never a secret', () => {
  const lines = []
  assert.equal(main([], { root: checkout({ env: ENV }), log: (line) => lines.push(line) }), 0)
  const output = lines.join('\n')
  assert.match(output, /^Panel +http:\/\/panel\.opos\.localhost:5173 +pnpm local:start$/m)
  assert.match(output, /^Mailpit +http:\/\/127\.0\.0\.1:54324 +pnpm stack:up$/m)
  assert.doesNotMatch(output, /sb_secret|password/)
})

test('asks for stack:init in a checkout without apps/api/.env', () => {
  const lines = []
  assert.equal(main([], { root: checkout({}), log: (line) => lines.push(line) }), 1)
  assert.deepEqual(lines, ['apps/api/.env is missing; run pnpm stack:init first'])
})
