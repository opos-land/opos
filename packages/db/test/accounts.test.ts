import { describe, expect, it } from 'vitest'
import { authAdmin, createUser, migrator } from './db'

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
    const [row] = await migrator<{ created_at: Date; updated_at: Date }[]>`
      select created_at, updated_at from accounts where id = ${user.id}
    `
    expect(row!.updated_at.getTime()).toBeGreaterThan(row!.created_at.getTime())
  })

  it('disappears with the user', async () => {
    const user = await createUser()

    await authAdmin`delete from auth.users where id = ${user.id}`

    expect(await account(user.id)).toBeUndefined()
  })
})
