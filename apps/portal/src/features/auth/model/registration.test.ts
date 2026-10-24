import { describe, expect, it } from 'vitest'
import { passwordSchema, registrationSchema } from './registration'

const valid = {
  firstName: ' Anna ',
  lastName: 'Nowak',
  email: 'anna@example.test',
  password: 'correct horse',
}

describe('registrationSchema', () => {
  it('takes the names trimmed', () => {
    expect(registrationSchema.parse(valid)).toMatchObject({ firstName: 'Anna', lastName: 'Nowak' })
  })

  it.each([
    ['firstName', '   '],
    ['lastName', 'x'.repeat(101)],
    ['email', 'anna'],
    ['password', 'short'],
  ])('refuses an invalid %s', (field, value) => {
    const result = registrationSchema.safeParse({ ...valid, [field]: value })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([field])
  })
})

describe('passwordSchema', () => {
  it('needs the password twice, the same', () => {
    expect(
      passwordSchema.safeParse({ password: 'long enough', repeat: 'long enough' }).success,
    ).toBe(true)
    expect(
      passwordSchema.safeParse({ password: 'long enough', repeat: 'long enouhg' }).error?.issues[0]
        ?.path,
    ).toEqual(['repeat'])
  })
})
