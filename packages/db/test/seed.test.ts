import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { migrator } from './db'

// The seed refuses before it opens a connection: it runs where OPOS_ENV is local or dev, and a
// missing variable stops it.

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

describe('db:seed Auth URL', { timeout: 30_000 }, () => {
  it('refuses a remote Auth URL on local before it creates an account', () => {
    const { status, stderr } = seed({
      OPOS_ENV: 'local',
      SUPABASE_URL: 'https://auth.remote.example',
      SUPABASE_SECRET_KEY: 'sb_secret_x',
      DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
    })

    expect(status).toBe(1)
    expect(stderr).toMatch(/SUPABASE_URL names the remote host auth\.remote\.example/)
    expect(stderr).not.toContain('sb_secret_x')
  })
})

// The two-factor demo account is enrolled through Supabase Auth, never written into auth; it
// runs the whole seed against the local stack.
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
    'enrolls again after the password has changed and the factor is gone',
    { timeout: 120_000 },
    async () => {
      const id = await accountId()
      await removeFactors(id)
      const changed = await fetch(`${authUrl}/admin/users/${id}`, {
        method: 'PUT',
        headers: { apikey: process.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'a-password-chosen-since' }),
      })
      expect(changed.status).toBe(200)

      const run = runSeed('local')

      expect(run.status, run.stderr).toBe(0)
      expect((await factors(id)).map((factor) => factor.status)).toEqual(['verified'])
      // The password is reset only to enroll: a rerun that finds the factor leaves it alone.
      const kept = await fetch(`${authUrl}/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: process.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      })
      expect(kept.status).toBe(200)
      await fetch(`${authUrl}/admin/users/${id}`, {
        method: 'PUT',
        headers: { apikey: process.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'a-password-chosen-since' }),
      })
      const rerun = runSeed('local')
      expect(rerun.status, rerun.stderr).toBe(0)
      const left = await fetch(`${authUrl}/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: process.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'a-password-chosen-since' }),
      })
      expect(left.status).toBe(200)
      // Back to the demo password for the tests after this one.
      await fetch(`${authUrl}/admin/users/${id}`, {
        method: 'PUT',
        headers: { apikey: process.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'password123' }),
      })
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

// One account heads both conventions, so the panel's convention picker and switch have someone to
// show; a head holds no tenant-level permission and never expires.
describe('db:seed head of two conventions', () => {
  it('makes multi@example.com a head organizer of both', { timeout: 120_000 }, async () => {
    const run = runSeed('local')
    expect(run.status, run.stderr).toBe(0)

    const rows = await migrator<
      { slug: string; role: string; settings_access: string; expires_at: Date | null }[]
    >`
      select t.slug, m.role, m.settings_access, m.expires_at
      from tenant_memberships m
      join tenants t on t.id = m.tenant_id
      join accounts a on a.id = m.account_id
      where a.email = 'multi@example.com'
      order by t.slug
    `

    expect(rows).toEqual([
      { slug: 'convention-a', role: 'head', settings_access: 'none', expires_at: null },
      { slug: 'convention-b', role: 'head', settings_access: 'none', expires_at: null },
    ])
  })
})

// The admin of the demo data: two-factor authentication on, and the role bound to that factor, so
// the admin application has someone to sign in.
describe('db:seed admin', () => {
  const email = 'admin@example.com'
  const authUrl = `${process.env.SUPABASE_URL?.replace(/\/+$/, '')}/auth/v1`
  const admin = (method: string, path: string) =>
    fetch(`${authUrl}${path}`, { method, headers: { apikey: process.env.SUPABASE_SECRET_KEY! } })

  const state = async () =>
    (
      await migrator<{ id: string; mfa: boolean; bound: boolean | null }[]>`
        select c.id, c.mfa_enabled_at is not null as mfa,
          a.mfa_enabled_at = c.mfa_enabled_at as bound
        from accounts c left join admins a on a.account_id = c.id where c.email = ${email}
      `
    )[0]

  const grants = async (id: string) =>
    (
      await migrator<{ count: number }[]>`
        select count(*)::int as count from admin_actions
        where action = 'admin.grant' and subject_account_id = ${id}
      `
    )[0]!.count

  it('grants the role to an account with a second factor, once', { timeout: 120_000 }, async () => {
    const first = runSeed('local')
    expect(first.status, first.stderr).toBe(0)

    const granted = await state()
    expect(granted).toMatchObject({ mfa: true, bound: true })
    const logged = await grants(granted!.id)
    expect(logged).toBeGreaterThan(0)

    // A rerun finds the grant standing and leaves no second entry in the log.
    const second = runSeed('local')
    expect(second.status, second.stderr).toBe(0)
    expect(await grants(granted!.id)).toBe(logged)
  })

  it('grants the role anew once the factor was replaced', { timeout: 120_000 }, async () => {
    const before = await state()
    const user = await admin('GET', `/admin/users/${before!.id}`)
    const { factors = [] } = (await user.json()) as { factors?: { id: string }[] }
    for (const factor of factors) {
      await admin('DELETE', `/admin/users/${before!.id}/factors/${factor.id}`)
    }
    expect(await state()).toMatchObject({ mfa: false })

    const run = runSeed('local')

    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toMatch(/admin@example\.com TOTP secret: [A-Z2-7]{16,}/)
    expect(await state()).toMatchObject({ mfa: true, bound: true })
  })
})

// A suspended convention with a head of its own, for the admin application, the panel and the
// portal to show; the other two are not suspended, whatever was done to them since the last run.
describe('db:seed suspended tenant', () => {
  const suspended = () =>
    migrator<{ slug: string; suspended: boolean }[]>`
      select slug, suspended_at is not null as suspended from tenants
      where slug like 'convention-%' order by slug
    `

  it('suspends convention-c and no other', { timeout: 120_000 }, async () => {
    await migrator`update tenants set suspended_at = now() where slug = 'convention-a'`
    await migrator`update tenants set suspended_at = null where slug = 'convention-c'`

    const run = runSeed('local')

    expect(run.status, run.stderr).toBe(0)
    expect(await suspended()).toEqual([
      { slug: 'convention-a', suspended: false },
      { slug: 'convention-b', suspended: false },
      { slug: 'convention-c', suspended: true },
    ])
    expect(
      await migrator`
        select a.email, m.role from tenant_memberships m
        join tenants t on t.id = m.tenant_id join accounts a on a.id = m.account_id
        where t.slug = 'convention-c'
      `,
    ).toEqual([{ email: 'head@convention-c.test', role: 'head' }])
  })

  // The slug of a deleted tenant is held back for good; the seed owns the slugs of its tenants.
  it('brings back a demo tenant an admin deleted', { timeout: 120_000 }, async () => {
    await migrator`delete from tenants where slug = 'convention-c'`
    expect(
      await migrator`select 1 from retired_tenant_slugs where slug = 'convention-c'`,
    ).toHaveLength(1)

    const run = runSeed('local')

    expect(run.status, run.stderr).toBe(0)
    expect(await suspended()).toContainEqual({ slug: 'convention-c', suspended: true })
    expect(
      await migrator`select 1 from retired_tenant_slugs where slug = 'convention-c'`,
    ).toHaveLength(0)
  })
})
