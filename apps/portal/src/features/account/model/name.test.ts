import { describe, expect, it } from 'vitest'
import { nameSchema, nameUpdate, nameValues } from './name'

describe('nameUpdate', () => {
  it('sends the names trimmed', () => {
    expect(nameUpdate({ firstName: ' Anna ', lastName: 'Nowak ' })).toEqual({
      firstName: 'Anna',
      lastName: 'Nowak',
    })
  })

  it('clears an emptied name', () => {
    expect(nameUpdate({ firstName: '   ', lastName: '' })).toEqual({
      firstName: null,
      lastName: null,
    })
  })
})

describe('nameValues', () => {
  it('shows a missing name as an empty field', () => {
    expect(
      nameValues({
        id: '00000000-0000-4000-8000-000000000000',
        email: 'anna@example.test',
        firstName: null,
        lastName: 'Nowak',
        nickname: null,
        nameOrder: 'nickname-middle' as const,
        locale: null,
        theme: null,
        mfaEnabled: false,
      }),
    ).toEqual({ firstName: '', lastName: 'Nowak' })
  })
})

describe('nameSchema', () => {
  it('refuses a name above 100 characters', () => {
    expect(nameSchema.safeParse({ firstName: 'x'.repeat(101), lastName: '' }).success).toBe(false)
  })
})
