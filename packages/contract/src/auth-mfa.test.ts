import { describe, expect, it } from 'vitest'
import { contract } from './index'
import { enableMfaSchema, recoverSchema, verifyMfaSchema } from './auth-mfa'

const factorId = '5f0c9a4e-3a55-4b9a-8e0c-7b8f1f1b2c3d'

// What the two-factor routes take.
describe('verifyMfaSchema', () => {
  it('takes six digits, trimmed', () => {
    expect(verifyMfaSchema.parse({ code: ' 123456 ' })).toEqual({ code: '123456' })
  })

  it.each(['12345', '1234567', 'abcdef', '12 456', ''])('refuses %j', (code) => {
    expect(verifyMfaSchema.safeParse({ code }).success).toBe(false)
  })

  it('refuses a field it does not name', () => {
    expect(verifyMfaSchema.safeParse({ code: '123456', factorId }).success).toBe(false)
  })
})

describe('enableMfaSchema', () => {
  it('takes a factor id and a code', () => {
    expect(enableMfaSchema.parse({ factorId, code: '123456' })).toEqual({
      factorId,
      code: '123456',
    })
  })

  it('refuses an id that is no uuid, and a missing code', () => {
    expect(enableMfaSchema.safeParse({ factorId: 'x', code: '123456' }).success).toBe(false)
    expect(enableMfaSchema.safeParse({ factorId }).success).toBe(false)
  })
})

describe('recoverSchema', () => {
  it('takes a recovery code as typed, spaces and hyphens included', () => {
    expect(recoverSchema.parse({ code: ' abcd-efgh ijkl-mnop ' })).toEqual({
      code: 'abcd-efgh ijkl-mnop',
    })
  })

  it('refuses an empty code and one far longer than any recovery code', () => {
    expect(recoverSchema.safeParse({ code: '' }).success).toBe(false)
    expect(recoverSchema.safeParse({ code: 'A'.repeat(65) }).success).toBe(false)
  })
})

describe('contract.auth.mfa', () => {
  it.each([
    ['enroll', 'POST', '/auth/mfa/enroll'],
    ['enable', 'POST', '/auth/mfa/enable'],
    ['verify', 'POST', '/auth/mfa/verify'],
    ['recover', 'POST', '/auth/mfa/recover'],
    ['disable', 'DELETE', '/auth/mfa'],
  ] as const)('%s is %s %s', (name, method, path) => {
    expect(contract.auth.mfa[name]['~orpc'].route).toMatchObject({ method, path })
  })

  it('answers 204 on verify, recover and disable', () => {
    for (const name of ['verify', 'recover', 'disable'] as const) {
      expect(contract.auth.mfa[name]['~orpc'].route.successStatus).toBe(204)
    }
  })
})
