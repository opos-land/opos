import { describe, expect, it } from 'vitest'
import { app, authAdmin, createUser, global, migrator } from './db'

const account = async (id: string) => {
  const [row] = await migrator`
    select email, first_name, last_name, locale from accounts where id = ${id}
  `
  return row
}

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

  it('disappears with the user', async () => {
    const user = await createUser()

    await authAdmin`delete from auth.users where id = ${user.id}`

    expect(await account(user.id)).toBeUndefined()
  })
})

describe('accounts constraints', () => {
  it('refuses an email that is not lowercase', async () => {
    const user = await createUser()

    await expect(
      migrator`update accounts set email = 'Mixed@Example.test' where id = ${user.id}`,
    ).rejects.toThrow(/accounts_email_lowercase/)
  })
})

describe('accounts on the runtime roles', () => {
  it('lets opos_app read every column and change only the names and the locale', async () => {
    const user = await createUser()

    await app`update accounts set first_name = 'Ola', last_name = 'Lis', locale = 'en' where id = ${user.id}`
    expect(await account(user.id)).toMatchObject({
      first_name: 'Ola',
      last_name: 'Lis',
      locale: 'en',
    })
    expect(await app`select email from accounts where id = ${user.id}`).toHaveLength(1)
    for (const query of [
      app`update accounts set email = 'other@example.test' where id = ${user.id}`,
      app`update accounts set updated_at = now() where id = ${user.id}`,
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
