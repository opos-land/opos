import { describe, expect, it } from 'vitest'
import { profileSchema, profileUpdate, profileValues } from './profile'

describe('profileUpdate', () => {
  it('sends the names trimmed', () => {
    expect(profileUpdate({ firstName: ' Anna ', lastName: 'Nowak ' })).toEqual({
      firstName: 'Anna',
      lastName: 'Nowak',
    })
  })

  it('clears an emptied name', () => {
    expect(profileUpdate({ firstName: '   ', lastName: '' })).toEqual({
      firstName: null,
      lastName: null,
    })
  })
})

describe('profileValues', () => {
  it('shows a missing name as an empty field', () => {
    expect(
      profileValues({
        id: '00000000-0000-4000-8000-000000000000',
        email: 'anna@example.test',
        firstName: null,
        lastName: 'Nowak',
        locale: null,
      }),
    ).toEqual({ firstName: '', lastName: 'Nowak' })
  })
})

describe('profileSchema', () => {
  it('refuses a name above 100 characters', () => {
    expect(profileSchema.safeParse({ firstName: 'x'.repeat(101), lastName: '' }).success).toBe(
      false,
    )
  })
})
