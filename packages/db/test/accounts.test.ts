import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { app, authAdmin, createUser, global, migrator } from './db'

const account = async (id: string) => {
  const [row] = await migrator`
    select email, first_name, last_name, locale from accounts where id = ${id}
  `
  return row
}

const confirmedAt = async (id: string) =>
  (
    await migrator<{ email_confirmed_at: Date | null }[]>`
      select email_confirmed_at from accounts where id = ${id}
    `
  )[0]!.email_confirmed_at

describe('accounts mirror auth.users', () => {
  it('creates an account with the sign-up metadata', async () => {
    const user = await createUser({ first_name: 'Anna', last_name: 'Nowak', locale: 'en' })

    expect(await account(user.id)).toEqual({
      email: user.email.toLowerCase(),
      first_name: 'Anna',
      last_name: 'Nowak',
      locale: 'en',
    })
  })

  it('creates an account with no theme, so the interface follows the system', async () => {
    const user = await createUser({ first_name: 'Anna' })

    const [row] = await migrator`select theme from accounts where id = ${user.id}`
    expect(row).toEqual({ theme: null })
  })

  it('splits a Google full name on the first space', async () => {
    const user = await createUser({ full_name: 'Jan Maria Kowalski' })

    expect(await account(user.id)).toMatchObject({ first_name: 'Jan', last_name: 'Maria Kowalski' })
  })

  it('keeps a single-word full name as the first name', async () => {
    const user = await createUser({ full_name: 'Cher' })

    expect(await account(user.id)).toMatchObject({ first_name: 'Cher', last_name: null })
  })

  it('follows an email change', async () => {
    const user = await createUser()
    const email = `Changed-${user.id.slice(0, 8)}@Example.test`

    await authAdmin`update auth.users set email = ${email} where id = ${user.id}`

    expect(await account(user.id)).toMatchObject({ email: email.toLowerCase() })
    // Compared in Postgres: a JS Date drops the microseconds, and both can share a millisecond.
    const [row] = await migrator<{ moved: boolean }[]>`
      select updated_at > created_at as moved from accounts where id = ${user.id}
    `
    expect(row!.moved).toBe(true)
  })

  it('mirrors the email confirmation of the user', async () => {
    const confirmed = await createUser()
    const pending = await createUser({}, { confirmed: false })

    expect(await confirmedAt(confirmed.id)).toBeInstanceOf(Date)
    expect(await confirmedAt(pending.id)).toBeNull()
  })

  it('follows the confirmation of the email', async () => {
    const user = await createUser({}, { confirmed: false })

    const at = new Date('2026-01-02T03:04:05Z')
    await authAdmin`update auth.users set email_confirmed_at = ${at} where id = ${user.id}`

    expect(await confirmedAt(user.id)).toEqual(at)
  })

  it('disappears with the user', async () => {
    const user = await createUser()

    await authAdmin`delete from auth.users where id = ${user.id}`

    expect(await account(user.id)).toBeUndefined()
  })
})

const mfaEnabledAt = async (id: string) =>
  (
    await migrator<{ mfa_enabled_at: Date | null }[]>`
      select mfa_enabled_at from accounts where id = ${id}
    `
  )[0]!.mfa_enabled_at

/** A TOTP factor as Supabase Auth stores it; written as supabase_auth_admin, the role Supabase Auth writes with. */
const addFactor = async (userId: string, status: 'unverified' | 'verified') => {
  const [factor] = await authAdmin<{ id: string }[]>`
    insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
    values (gen_random_uuid(), ${userId}, gen_random_uuid()::text, 'totp', ${status}, now(), now(), 'JBSWY3DPEHPK3PXP')
    returning id
  `
  return factor!.id
}

describe('accounts mirror auth.mfa_factors', () => {
  it('sets mfa_enabled_at when a factor is inserted verified', async () => {
    const user = await createUser()
    expect(await mfaEnabledAt(user.id)).toBeNull()

    await addFactor(user.id, 'verified')

    expect(await mfaEnabledAt(user.id)).toBeInstanceOf(Date)
  })

  it('sets mfa_enabled_at when a factor reaches verified', async () => {
    const user = await createUser()
    const factor = await addFactor(user.id, 'unverified')
    expect(await mfaEnabledAt(user.id)).toBeNull()

    await authAdmin`update auth.mfa_factors set status = 'verified' where id = ${factor}`

    expect(await mfaEnabledAt(user.id)).toBeInstanceOf(Date)
  })

  it('leaves mfa_enabled_at null for an unverified factor', async () => {
    const user = await createUser()

    await addFactor(user.id, 'unverified')

    expect(await mfaEnabledAt(user.id)).toBeNull()
  })

  it('clears mfa_enabled_at when the last verified factor is removed', async () => {
    const user = await createUser()
    const factor = await addFactor(user.id, 'verified')

    await authAdmin`delete from auth.mfa_factors where id = ${factor}`

    expect(await mfaEnabledAt(user.id)).toBeNull()
  })

  it('keeps mfa_enabled_at while another verified factor remains', async () => {
    const user = await createUser()
    const first = await addFactor(user.id, 'verified')
    const before = await mfaEnabledAt(user.id)

    await addFactor(user.id, 'verified')
    expect(await mfaEnabledAt(user.id)).toEqual(before)
    await authAdmin`delete from auth.mfa_factors where id = ${first}`

    expect(await mfaEnabledAt(user.id)).toEqual(before)
  })

  it('clears mfa_enabled_at when a verified factor goes back to unverified', async () => {
    const user = await createUser()
    const factor = await addFactor(user.id, 'verified')

    await authAdmin`update auth.mfa_factors set status = 'unverified' where id = ${factor}`

    expect(await mfaEnabledAt(user.id)).toBeNull()
  })

  it('leaves another account alone', async () => {
    const user = await createUser()
    const other = await createUser()

    await addFactor(user.id, 'verified')

    expect(await mfaEnabledAt(other.id)).toBeNull()
  })

  // Supabase Auth runs each removal in a transaction of its own: without
  // a lock on the account row, two removals that overlap each see the other's factor still there.
  it('clears mfa_enabled_at when two overlapping transactions remove the last two verified factors', async () => {
    const user = await createUser()
    const first = await addFactor(user.id, 'verified')
    const second = await addFactor(user.id, 'verified')
    expect(await mfaEnabledAt(user.id)).toBeInstanceOf(Date)
    let firstRemoved!: () => void
    const removed = new Promise<void>((resolve) => (firstRemoved = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))

    const earlier = authAdmin.begin(async (tx) => {
      await tx`delete from auth.mfa_factors where id = ${first}`
      firstRemoved()
      await released
    })
    await removed
    const later = authAdmin.begin(async (tx) => {
      await tx`delete from auth.mfa_factors where id = ${second}`
    })
    await new Promise((resolve) => setTimeout(resolve, 500))
    release()
    await Promise.all([earlier, later])

    expect(await mfaEnabledAt(user.id)).toBeNull()
  })

  it('lets the user be deleted with a verified factor', async () => {
    const user = await createUser()
    await addFactor(user.id, 'verified')

    await authAdmin`delete from auth.users where id = ${user.id}`

    expect(await account(user.id)).toBeUndefined()
  })
})

describe('the mfa_enabled_at backfill', () => {
  const backfill = readFileSync(
    new URL('../drizzle/0022_backfill_mfa_enabled_at.sql', import.meta.url),
    'utf8',
  )

  it('sets it for an account holding a verified factor and leaves the others', async () => {
    const holder = await createUser()
    const pending = await createUser()
    const none = await createUser()
    await addFactor(holder.id, 'verified')
    await addFactor(pending.id, 'unverified')
    // The state of an account whose factor predates the trigger.
    await migrator`update accounts set mfa_enabled_at = null where id = ${holder.id}`
    expect(await mfaEnabledAt(holder.id)).toBeNull()

    await migrator.unsafe(backfill)

    expect(await mfaEnabledAt(holder.id)).toBeInstanceOf(Date)
    expect(await mfaEnabledAt(pending.id)).toBeNull()
    expect(await mfaEnabledAt(none.id)).toBeNull()
  })

  it('keeps the time of an account that is already set', async () => {
    const user = await createUser()
    await addFactor(user.id, 'verified')
    const before = await mfaEnabledAt(user.id)

    await migrator.unsafe(backfill)

    expect(await mfaEnabledAt(user.id)).toEqual(before)
  })

  it('writes nothing into auth', () => {
    expect(backfill).not.toMatch(/\b(insert\s+into|delete\s+from|update)\s+auth\./i)
  })
})

describe('account_recovery_codes', () => {
  const addCodes = async (accountId: string, hashes: string[]) => {
    for (const hash of hashes) {
      await migrator`insert into account_recovery_codes (account_id, code_hash) values (${accountId}, ${hash})`
    }
  }

  it('disappear with the account', async () => {
    const user = await createUser()
    await addCodes(user.id, ['a'.repeat(64), 'b'.repeat(64)])

    await authAdmin`delete from auth.users where id = ${user.id}`

    const rows = await migrator`select 1 from account_recovery_codes where account_id = ${user.id}`
    expect(rows).toHaveLength(0)
  })

  it('refuses the same hash twice for one account', async () => {
    const user = await createUser()
    await addCodes(user.id, ['c'.repeat(64)])

    await expect(addCodes(user.id, ['c'.repeat(64)])).rejects.toThrow(/duplicate key/)
  })

  it('lets opos_app select, insert and delete, and update only used_at', async () => {
    const user = await createUser()
    const hash = 'd'.repeat(64)

    await app`insert into account_recovery_codes (account_id, code_hash) values (${user.id}, ${hash})`
    expect(
      await app`select used_at from account_recovery_codes where account_id = ${user.id}`,
    ).toHaveLength(1)
    await app`update account_recovery_codes set used_at = now() where account_id = ${user.id}`
    const [row] = await migrator<{ moved: boolean; used: boolean }[]>`
      select updated_at > created_at as moved, used_at is not null as used
      from account_recovery_codes where account_id = ${user.id}
    `
    expect(row).toEqual({ moved: true, used: true })
    for (const query of [
      app`update account_recovery_codes set code_hash = 'x' where account_id = ${user.id}`,
      app`update account_recovery_codes set account_id = gen_random_uuid() where account_id = ${user.id}`,
      app`update account_recovery_codes set updated_at = now() where account_id = ${user.id}`,
    ]) {
      await expect(query).rejects.toThrow(/permission denied/)
    }
    await app`delete from account_recovery_codes where account_id = ${user.id}`
    expect(
      await app`select 1 from account_recovery_codes where account_id = ${user.id}`,
    ).toHaveLength(0)
  })

  it('gives opos_app_global no access', async () => {
    const user = await createUser()
    await addCodes(user.id, ['e'.repeat(64)])

    for (const query of [
      global`select 1 from account_recovery_codes`,
      global`update account_recovery_codes set used_at = now()`,
      global`delete from account_recovery_codes`,
      global`insert into account_recovery_codes (account_id, code_hash) values (${user.id}, 'x')`,
    ]) {
      await expect(query).rejects.toThrow(/permission denied/)
    }
  })

  it('is out of reach of the Supabase API roles', async () => {
    const [row] = await migrator<{ held: boolean }[]>`
      select bool_or(has_table_privilege(r.role, 'account_recovery_codes', 'SELECT')) as held
      from (values ('anon'), ('authenticated'), ('service_role')) r(role)
    `
    expect(row!.held).toBe(false)
  })
})

describe('accounts constraints', () => {
  it('refuses an email that is not lowercase', async () => {
    const user = await createUser()

    await expect(
      migrator`update accounts set email = 'Mixed@Example.test' where id = ${user.id}`,
    ).rejects.toThrow(/accounts_email_lowercase/)
  })

  it('refuses a theme other than light or dark', async () => {
    const user = await createUser()

    await expect(
      migrator`update accounts set theme = 'blue' where id = ${user.id}`,
    ).rejects.toThrow(/invalid input value for enum theme/)
  })
})

describe('accounts on the runtime roles', () => {
  it('lets opos_app read every column and change only the names, the locale and the theme', async () => {
    const user = await createUser()

    await app`update accounts set first_name = 'Ola', last_name = 'Lis', locale = 'en', theme = 'dark' where id = ${user.id}`
    expect(await account(user.id)).toMatchObject({
      first_name: 'Ola',
      last_name: 'Lis',
      locale: 'en',
    })
    expect(await app`select theme from accounts where id = ${user.id}`).toEqual([{ theme: 'dark' }])
    await app`update accounts set theme = null where id = ${user.id}`
    expect(await app`select theme from accounts where id = ${user.id}`).toEqual([{ theme: null }])
    expect(await app`select email from accounts where id = ${user.id}`).toHaveLength(1)
    for (const query of [
      app`update accounts set email = 'other@example.test' where id = ${user.id}`,
      app`update accounts set updated_at = now() where id = ${user.id}`,
      app`update accounts set email_confirmed_at = now() where id = ${user.id}`,
      app`update accounts set mfa_enabled_at = now() where id = ${user.id}`,
      app`delete from accounts where id = ${user.id}`,
      app`insert into accounts (id, email) values (gen_random_uuid(), 'x@example.test')`,
    ]) {
      await expect(query).rejects.toThrow(/permission denied/)
    }
  })

  it('gives opos_app_global no access to accounts', async () => {
    const user = await createUser()

    for (const query of [
      global`select 1 from accounts where id = ${user.id}`,
      global`update accounts set first_name = 'X' where id = ${user.id}`,
      global`delete from accounts where id = ${user.id}`,
      global`insert into accounts (id, email) values (gen_random_uuid(), 'x@example.test')`,
    ]) {
      await expect(query).rejects.toThrow(/permission denied/)
    }
  })
})
