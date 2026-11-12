import { spawnSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { grantAdmin, recordAdminAction, revokeAdmin } from '../src/admins'
import { adminDb, migrationDb } from '../src/client'
import { migrationUrl } from '../src/migration-url'
import {
  addFactor,
  admin,
  adminPassword,
  authAdmin,
  createAdminCandidate,
  createTenant,
  createUser,
  migrator,
  removeFactors,
  setPassword,
  unique,
  url,
} from './db'

// The admin role: granted and taken away by postgres alone, behind the two scripts, and bound to
// the second factor the account had at the grant (docs/adr/0030). The log is written by the two
// scripts and, through recordAdminAction, by opos_admin.

const db = migrationDb(migrationUrl(), { max: 2 })
const asAdmin = adminDb(url('opos_admin', adminPassword), { max: 2 })
afterAll(() => Promise.all([db, asAdmin].map((pool) => pool.$client.end())))

class Rollback extends Error {}

const grantOf = async (accountId: string) =>
  (
    await migrator<{ granted_at: Date; mfa_enabled_at: Date }[]>`
      select granted_at, mfa_enabled_at from admins where account_id = ${accountId}
    `
  )[0]

/**
 * Whether the grant names the factor the account has now, judged by the database: a timestamp
 * holds microseconds, which a Date read here would round away.
 */
const bound = async (accountId: string) =>
  (
    await migrator<{ bound: boolean }[]>`
      select a.mfa_enabled_at = c.mfa_enabled_at as bound
      from admins a join accounts c on c.id = a.account_id where a.account_id = ${accountId}
    `
  )[0]?.bound

const entriesAbout = (accountId: string) =>
  migrator<{ action: string; admin_account_id: string | null; subject_tenant_id: string | null }[]>`
    select action, admin_account_id, subject_tenant_id from admin_actions
    where subject_account_id = ${accountId} order by created_at
  `

describe('grantAdmin', () => {
  it('grants the role to a confirmed account with a password and a second factor', async () => {
    const user = await createAdminCandidate()

    expect(await grantAdmin(db, user.email.toUpperCase())).toEqual({ accountId: user.id })

    const grant = await grantOf(user.id)
    expect(grant?.granted_at).toBeInstanceOf(Date)
    // The grant holds the factor it found, to the microsecond: the role is bound to it.
    expect(await bound(user.id)).toBe(true)
    expect(await entriesAbout(user.id)).toEqual([
      { action: 'admin.grant', admin_account_id: null, subject_tenant_id: null },
    ])
  })

  it.each([
    [
      'an unknown address',
      () => Promise.resolve(`nobody-${unique()}@example.test`),
      'account.not-found',
    ],
    [
      'an unconfirmed address',
      async () => {
        const user = await createUser({}, { confirmed: false })
        await setPassword(user.id)
        await addFactor(user.id)
        return user.email
      },
      'account.unconfirmed',
    ],
    [
      'an account without a password',
      async () => {
        const user = await createUser()
        await addFactor(user.id)
        return user.email
      },
      'account.no-password',
    ],
    [
      'an account with two-factor authentication off',
      async () => {
        const user = await createUser()
        await setPassword(user.id)
        return user.email
      },
      'mfa.not-enabled',
    ],
    [
      'an account whose only factor is unverified',
      async () => {
        const user = await createUser()
        await setPassword(user.id)
        await addFactor(user.id, 'unverified')
        return user.email
      },
      'mfa.not-enabled',
    ],
  ])('refuses %s and writes nothing', async (_, make, code) => {
    const email = await make()
    const before = await migrator`select count(*)::int as count from admin_actions`

    await expect(grantAdmin(db, email)).rejects.toMatchObject({ code })

    expect(
      await migrator`
        select 1 from admins a join accounts c on c.id = a.account_id
        where c.email = ${email.toLowerCase()}
      `,
    ).toHaveLength(0)
    expect(await migrator`select count(*)::int as count from admin_actions`).toEqual(before)
  })

  it('binds a new grant to the factor that replaced the one of the first', async () => {
    const user = await createAdminCandidate()
    await grantAdmin(db, user.email)
    const first = await grantOf(user.id)

    await removeFactors(user.id)
    await addFactor(user.id)
    // The factor is another one now, so the grant no longer names it.
    expect(await bound(user.id)).toBe(false)

    await grantAdmin(db, user.email)

    const second = await grantOf(user.id)
    expect(await bound(user.id)).toBe(true)
    expect(second!.granted_at.getTime()).toBeGreaterThanOrEqual(first!.granted_at.getTime())
    expect(await migrator`select 1 from admins where account_id = ${user.id}`).toHaveLength(1)
    expect((await entriesAbout(user.id)).map((entry) => entry.action)).toEqual([
      'admin.grant',
      'admin.grant',
    ])
  })

  it('goes with its account, and leaves the log entries behind', async () => {
    const user = await createAdminCandidate()
    await grantAdmin(db, user.email)

    await authAdmin`delete from auth.users where id = ${user.id}`

    expect(await grantOf(user.id)).toBeUndefined()
    expect(await entriesAbout(user.id)).toHaveLength(1)
  })
})

describe('revokeAdmin', () => {
  it('takes the role away and leaves an entry', async () => {
    const user = await createAdminCandidate()
    await grantAdmin(db, user.email)

    expect(await revokeAdmin(db, ` ${user.email.toUpperCase()} `)).toEqual({ accountId: user.id })

    expect(await grantOf(user.id)).toBeUndefined()
    expect(await entriesAbout(user.id)).toEqual([
      { action: 'admin.grant', admin_account_id: null, subject_tenant_id: null },
      { action: 'admin.revoke', admin_account_id: null, subject_tenant_id: null },
    ])
  })

  it('refuses an unknown address and an account that is no admin, writing nothing', async () => {
    const user = await createAdminCandidate()

    await expect(revokeAdmin(db, `nobody-${unique()}@example.test`)).rejects.toMatchObject({
      code: 'account.not-found',
    })
    await expect(revokeAdmin(db, user.email)).rejects.toMatchObject({ code: 'account.not-admin' })
    expect(await entriesAbout(user.id)).toEqual([])
  })
})

describe('recordAdminAction', () => {
  const actor = async () => {
    const user = await createAdminCandidate()
    await grantAdmin(db, user.email)
    return user.id
  }

  it('adds an entry as opos_admin, with the time and the identifier the database gives', async () => {
    const [adminAccountId, tenant] = await Promise.all([actor(), createTenant()])

    await recordAdminAction(asAdmin, {
      action: 'tenant.suspend',
      adminAccountId,
      tenant: { id: tenant.id, slug: tenant.slug },
    })

    const rows = await migrator`
      select action, admin_account_id, tenant_slug, subject_account_id,
        id is not null as has_id, created_at <= now() as dated
      from admin_actions where subject_tenant_id = ${tenant.id}
    `
    expect(rows).toEqual([
      {
        action: 'tenant.suspend',
        admin_account_id: adminAccountId,
        tenant_slug: tenant.slug,
        subject_account_id: null,
        has_id: true,
        dated: true,
      },
    ])
  })

  it('names the first head of a created tenant', async () => {
    const [adminAccountId, tenant] = await Promise.all([actor(), createTenant()])

    await recordAdminAction(asAdmin, {
      action: 'tenant.create',
      adminAccountId,
      tenant: { id: tenant.id, slug: tenant.slug },
      accountId: tenant.headId,
    })

    expect(
      await migrator`
        select subject_account_id from admin_actions where subject_tenant_id = ${tenant.id}
      `,
    ).toEqual([{ subject_account_id: tenant.headId }])
  })

  it('rolls back with the transaction of its caller', async () => {
    const [adminAccountId, tenant] = await Promise.all([actor(), createTenant()])

    await asAdmin
      .transaction(async (tx) => {
        await recordAdminAction(tx, {
          action: 'tenant.restore',
          adminAccountId,
          tenant: { id: tenant.id, slug: tenant.slug },
        })
        throw new Rollback()
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error
      })

    expect(
      await migrator`select 1 from admin_actions where subject_tenant_id = ${tenant.id}`,
    ).toHaveLength(0)
  })

  it('outlives the tenant and the accounts it names', async () => {
    const [adminAccountId, tenant] = await Promise.all([actor(), createTenant()])
    await recordAdminAction(asAdmin, {
      action: 'tenant.delete',
      adminAccountId,
      tenant: { id: tenant.id, slug: tenant.slug },
    })

    await migrator`delete from tenants where id = ${tenant.id}`
    await authAdmin`delete from auth.users where id = ${adminAccountId}`

    expect(
      await migrator`
        select admin_account_id, tenant_slug from admin_actions where subject_tenant_id = ${tenant.id}
      `,
    ).toEqual([{ admin_account_id: adminAccountId, tenant_slug: tenant.slug }])
  })

  it.each([
    [
      'a tenant action that names no tenant',
      { action: 'tenant.suspend', adminAccountId: true },
      'admin_actions_subject_matches_action',
    ],
    [
      'an account action that names a tenant',
      { action: 'account.reset-2fa', adminAccountId: true, tenant: true, accountId: true },
      'admin_actions_subject_matches_action',
    ],
    [
      'an account action that names no account',
      { action: 'account.reset-2fa', adminAccountId: true },
      'admin_actions_subject_matches_action',
    ],
    [
      'an account named by a tenant action other than its creation',
      { action: 'tenant.rename', adminAccountId: true, tenant: true, accountId: true },
      'admin_actions_subject_matches_action',
    ],
    [
      'a grant that names an admin, which a script alone makes',
      { action: 'admin.grant', adminAccountId: true, accountId: true },
      'admin_actions_script_or_admin',
    ],
    [
      'an action of the admin application that names no admin',
      { action: 'tenant.delete', tenant: true },
      'admin_actions_script_or_admin',
    ],
  ] as const)('refuses %s', async (_, shape, constraint) => {
    const [adminAccountId, tenant] = await Promise.all([actor(), createTenant()])

    await expect(
      recordAdminAction(asAdmin, {
        action: shape.action,
        ...('adminAccountId' in shape ? { adminAccountId } : {}),
        ...('tenant' in shape ? { tenant: { id: tenant.id, slug: tenant.slug } } : {}),
        ...('accountId' in shape ? { accountId: tenant.headId } : {}),
      }),
    ).rejects.toMatchObject({ cause: { constraint_name: constraint } })
  })

  it('lets opos_admin set neither the time nor the identifier of an entry', async () => {
    const [adminAccountId, tenant] = await Promise.all([actor(), createTenant()])
    const values = `'tenant.suspend', '${adminAccountId}', '${tenant.id}', '${tenant.slug}'`

    for (const [column, value] of [
      ['created_at', `'2020-01-01'`],
      ['id', 'gen_random_uuid()'],
    ]) {
      await expect(
        admin.unsafe(`
          insert into admin_actions (action, admin_account_id, subject_tenant_id, tenant_slug, ${column})
          values (${values}, ${value})
        `),
        column,
      ).rejects.toThrow(/permission denied/)
    }
  })

  it('lets opos_admin change and remove no entry, and write no admin', async () => {
    for (const statement of [
      `update admin_actions set tenant_slug = 'x' where false`,
      `delete from admin_actions where false`,
      `insert into admins (account_id) values (gen_random_uuid())`,
      `update admins set granted_at = now() where false`,
      `delete from admins where false`,
    ]) {
      await expect(admin.unsafe(statement), statement).rejects.toThrow(/permission denied/)
    }
  })
})

// Each case starts tsx in a process of its own, which takes seconds on a loaded machine.
describe('db:admin:grant and db:admin:revoke', { timeout: 60_000 }, () => {
  const run = (script: 'grant-admin' | 'revoke-admin', args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', `src/scripts/${script}.ts`, ...args], {
      env: process.env,
      encoding: 'utf8',
    })

  it('grant the role and take it away, each leaving its entry', async () => {
    const user = await createAdminCandidate()

    const granted = run('grant-admin', ['--email', user.email])
    expect(granted.status, granted.stderr).toBe(0)
    expect(granted.stdout).toContain(user.id)
    expect(await grantOf(user.id)).toBeDefined()

    const revoked = run('revoke-admin', ['--email', user.email])
    expect(revoked.status, revoked.stderr).toBe(0)
    expect(await grantOf(user.id)).toBeUndefined()
    expect((await entriesAbout(user.id)).map((entry) => entry.action)).toEqual([
      'admin.grant',
      'admin.revoke',
    ])
  })

  it('say why they refuse, by code, and fail', async () => {
    const user = await createUser()

    const granted = run('grant-admin', ['--email', user.email])
    expect(granted.status).toBe(1)
    expect(granted.stderr).toMatch(/^account\.no-password: /)

    const revoked = run('revoke-admin', ['--email', user.email])
    expect(revoked.status).toBe(1)
    expect(revoked.stderr).toMatch(/^account\.not-admin: /)
  })

  it.each(['grant-admin', 'revoke-admin'] as const)('%s asks for the address', (script) => {
    const result = run(script, [])

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/Usage: pnpm db:admin:(grant|revoke) --email <email>/)
  })
})
