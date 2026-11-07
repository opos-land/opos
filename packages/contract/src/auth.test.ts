import { describe, expect, it } from 'vitest'
import {
  confirmationTypeSchema,
  emailSchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
  verifySchema,
} from './auth'

// What the auth routes take: a sign-up takes no password, ever.
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

  it('refuses what is no address, and an address Supabase Auth would refuse for its length', () => {
    for (const bad of [
      'not-an-email',
      'a@',
      '@b.test',
      'a b@c.test',
      `${'x'.repeat(250)}@b.test`,
    ]) {
      expect(emailSchema.safeParse(bad).success).toBe(false)
    }
    expect(emailSchema.safeParse(`${'x'.repeat(245)}@b.test`).success).toBe(true)
    expect(emailSchema.parse(' Anna@Example.test ')).toBe('Anna@Example.test')
  })

  it('counts the bytes of a password, not its characters', () => {
    expect(newPasswordSchema.safeParse('ą'.repeat(36)).success).toBe(true)
    expect(newPasswordSchema.safeParse('ą'.repeat(37)).success).toBe(false)
    expect(newPasswordSchema.safeParse('x'.repeat(71) + 'ą').success).toBe(false)
  })
})
