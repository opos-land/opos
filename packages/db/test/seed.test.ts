import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { migrator } from './db'

// The seed refuses before it opens a connection: it runs where OPOS_ENV is local or dev, and a
// missing variable stops it (PLAN.md 11, 14).

const seed = (env: Record<string, string | undefined>) =>
  spawnSync(process.execPath, ['--import', 'tsx', 'src/seed.ts'], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  })

/** The whole seed against the local stack, with the environment of the test run. */
const runSeed = (opos: 'local' | 'dev') =>
  spawnSync(process.execPath, ['--import', 'tsx', 'src/seed.ts'], {
    env: { ...process.env, OPOS_ENV: opos },
    encoding: 'utf8',
  })

// Each case starts tsx in a process of its own, which takes seconds on a loaded machine.
describe('db:seed', { timeout: 30_000 }, () => {
  it.each([{}, { OPOS_ENV: 'production' }, { OPOS_ENV: 'staging' }])(
    'refuses where OPOS_ENV is not local or dev: %o',
    (env) => {
      const { status, stderr } = seed(env)

      expect(status).toBe(1)
      expect(stderr).toMatch(/OPOS_ENV/)
    },
  )

  it('ignores the old flag on production', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/seed.ts', '--i-know-what-i-am-doing'],
      { env: { PATH: process.env.PATH, OPOS_ENV: 'production' }, encoding: 'utf8' },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/OPOS_ENV/)
  })

  it.each([
    [{ OPOS_ENV: 'local' }, /SUPABASE_URL/],
    [{ OPOS_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:54321' }, /SUPABASE_SECRET_KEY/],
    [
      {
        OPOS_ENV: 'local',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SECRET_KEY: 'sb_secret_x',
      },
      /DATABASE_MIGRATION_URL/,
    ],
  ])('stops on a missing variable: %o', (env, missing) => {
    const { status, stderr } = seed(env)

    expect(status).not.toBe(0)
    expect(stderr).toMatch(missing)
    expect(stderr).not.toContain('sb_secret_x')
  })
})

// The two-factor demo account is enrolled through Supabase Auth, never written into auth
// (PLAN.md 4.6, 14); it runs the whole seed against the local stack.
describe('db:seed two-factor account', () => {
  const email = 'mfa@example.com'
  const authUrl = `${process.env.SUPABASE_URL?.replace(/\/+$/, '')}/auth/v1`
  const admin = (method: string, path: string) =>
    fetch(`${authUrl}${path}`, { method, headers: { apikey: process.env.SUPABASE_SECRET_KEY! } })

  const accountId = async () =>
    (await migrator<{ id: string }[]>`select id from accounts where email = ${email}`)[0]!.id

  const factors = async (id: string) => {
    const response = await admin('GET', `/admin/users/${id}`)
    return ((await response.json()) as { factors?: { id: string; status: string }[] }).factors ?? []
  }

  const removeFactors = async (id: string) => {
    for (const factor of await factors(id)) {
      await admin('DELETE', `/admin/users/${id}/factors/${factor.id}`)
    }
  }

  const codes = (id: string) =>
    migrator<{ code_hash: string; used_at: Date | null }[]>`
      select code_hash, used_at from account_recovery_codes where account_id = ${id}
    `

  it(
    'enrolls and verifies a factor through Supabase Auth, once',
    { timeout: 120_000 },
    async () => {
      const id = await accountId()
      await removeFactors(id)

      const first = runSeed('local')

      expect(first.status, first.stderr).toBe(0)
      expect(first.stdout).toMatch(/mfa@example\.com TOTP secret: [A-Z2-7]{16,}/)
      const enrolled = await factors(id)
      expect(enrolled).toHaveLength(1)
      expect(enrolled[0]!.status).toBe('verified')
      const [row] = await migrator<{ mfa_enabled_at: Date | null }[]>`
      select mfa_enabled_at from accounts where id = ${id}
    `
      expect(row!.mfa_enabled_at).toBeInstanceOf(Date)
      expect(await codes(id)).toHaveLength(10)

      // A rerun keeps the factor, prints no secret, and converges on the ten codes.
      await migrator`insert into account_recovery_codes (account_id, code_hash) values (${id}, ${'f'.repeat(64)})`
      await migrator`update account_recovery_codes set used_at = now() where account_id = ${id} and code_hash <> ${'f'.repeat(64)}`
      const second = runSeed('local')

      expect(second.status, second.stderr).toBe(0)
      expect(second.stdout).not.toMatch(/TOTP secret/)
      expect((await factors(id)).map((factor) => factor.id)).toEqual([enrolled[0]!.id])
      const rows = await codes(id)
      expect(rows).toHaveLength(10)
      expect(rows.every((code) => code.used_at === null)).toBe(true)
      expect(rows.map((code) => code.code_hash)).not.toContain('f'.repeat(64))
    },
  )

  it(
    'replaces a stale unverified factor and prints no secret on dev',
    { timeout: 120_000 },
    async () => {
      const id = await accountId()
      await removeFactors(id)
      const key = process.env.SUPABASE_SECRET_KEY!
      const json = { apikey: key, 'content-type': 'application/json' }
      const signIn = await fetch(`${authUrl}/token?grant_type=password`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ email, password: 'password123' }),
      })
      const { access_token } = (await signIn.json()) as { access_token: string }
      const stale = await fetch(`${authUrl}/factors`, {
        method: 'POST',
        headers: { ...json, authorization: `Bearer ${access_token}` },
        body: JSON.stringify({ factor_type: 'totp', friendly_name: 'Stale' }),
      })
      const { id: staleId } = (await stale.json()) as { id: string }
      expect((await factors(id)).map((factor) => factor.status)).toEqual(['unverified'])

      const run = runSeed('dev')

      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).not.toMatch(/TOTP secret/)
      expect(run.stdout).not.toMatch(/[A-Z2-7]{26,}/)
      const after = await factors(id)
      expect(after).toHaveLength(1)
      expect(after[0]).toMatchObject({ status: 'verified' })
      expect(after[0]!.id).not.toBe(staleId)
    },
  )
})

// A second run refuses only what a constraint refuses, so a plain insert into a table with no
// unique key would pass and double its rows. Every table of `public` counts, so a future table is
// covered with no change here.
describe('db:seed run twice', () => {
  const rowCounts = async () => {
    const tables = await migrator<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'
    `
    const counts: Record<string, number> = {}
    for (const { tablename } of tables) {
      const [row] = await migrator<{ count: number }[]>`
        select count(*)::int as count from ${migrator(tablename)}
      `
      counts[tablename] = row!.count
    }
    return counts
  }

  it('adds no row to any table of public on the second run', { timeout: 120_000 }, async () => {
    const first = runSeed('local')
    expect(first.status, first.stderr).toBe(0)
    const before = await rowCounts()
    // The migrator sees through row-level security, so a tenant table counts its real rows.
    expect(before.program_items).toBeGreaterThan(0)

    const second = runSeed('local')

    expect(second.status, second.stderr).toBe(0)
    expect(await rowCounts()).toEqual(before)
  })
})
