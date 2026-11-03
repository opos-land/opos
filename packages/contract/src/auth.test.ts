import { describe, expect, it } from 'vitest'
import {
  confirmationTypeSchema,
  emailSchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
  verifySchema,
} from './auth'

// What the auth routes take (PLAN.md 5.1): a sign-up takes no password, ever.
describe('signUpSchema', () => {
  it('takes an address and optional names', () => {
    expect(signUpSchema.parse({ email: ' anna@example.test ' })).toEqual({
      email: 'anna@example.test',
    })
    expect(signUpSchema.parse({ email: 'a@b.test', firstName: 'Anna', lastName: 'Nowak' })).toEqual(
      {
        email: 'a@b.test',
        firstName: 'Anna',
        lastName: 'Nowak',
      },
    )
  })

  it.each(['password', 'Password', 'newPassword'])('refuses a %s field', (field) => {
    const result = signUpSchema.safeParse({ email: 'a@b.test', [field]: 'secret-123' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ code: 'unrecognized_keys', keys: [field] })
  })
})

describe('the other inputs', () => {
  it('takes a password for sign-in as it is, spaces included', () => {
    expect(signInSchema.parse({ email: 'a@b.test', password: ' x y ' }).password).toBe(' x y ')
    expect(signInSchema.safeParse({ email: 'a@b.test', password: '' }).success).toBe(false)
  })

  it('takes a token hash and one of two link types', () => {
    expect(verifySchema.parse({ tokenHash: 'h', type: 'recovery' })).toEqual({
      tokenHash: 'h',
      type: 'recovery',
    })
    expect(confirmationTypeSchema.options).toEqual(['signup', 'recovery'])
    expect(verifySchema.safeParse({ tokenHash: 'h', type: 'email_change' }).success).toBe(false)
    expect(verifySchema.safeParse({ tokenHash: '', type: 'signup' }).success).toBe(false)
  })

  it('refuses an empty address and a password beyond what Supabase Auth hashes', () => {
    expect(emailSchema.safeParse('').success).toBe(false)
    expect(newPasswordSchema.safeParse('x'.repeat(73)).success).toBe(false)
    expect(newPasswordSchema.safeParse('x'.repeat(72)).success).toBe(true)
  })
})
