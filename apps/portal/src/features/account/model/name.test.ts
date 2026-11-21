import { type Account } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import { nameProblem, nameSchema, nameUpdate, nameValues } from './name'

const account: Account = {
  id: '00000000-0000-4000-8000-000000000000',
  email: 'anna@example.test',
  firstName: null,
  lastName: 'Nowak',
  nickname: null,
  nameOrder: 'nickname-middle',
  locale: null,
  theme: null,
  mfaEnabled: false,
}

const name = { firstName: '', nickname: '', lastName: '', nameOrder: 'nickname-middle' as const }

describe('nameUpdate', () => {
  it('sends the parts trimmed, with the order', () => {
    expect(
      nameUpdate({
        firstName: ' Anna ',
        nickname: ' Lisek',
        lastName: 'Nowak ',
        nameOrder: 'nickname-last',
      }),
    ).toEqual({
      firstName: 'Anna',
      nickname: 'Lisek',
      lastName: 'Nowak',
      nameOrder: 'nickname-last',
    })
  })

  it('clears an emptied part', () => {
    expect(nameUpdate({ ...name, firstName: '   ' })).toEqual({
      firstName: null,
      nickname: null,
      lastName: null,
      nameOrder: 'nickname-middle',
    })
  })
})

describe('nameValues', () => {
  it('shows a missing part as an empty field', () => {
    expect(nameValues(account)).toEqual({ ...name, lastName: 'Nowak' })
  })

  it('shows the nickname and the order the account chose', () => {
    expect(nameValues({ ...account, nickname: 'Lisek', nameOrder: 'nickname-last' })).toEqual({
      firstName: '',
      nickname: 'Lisek',
      lastName: 'Nowak',
      nameOrder: 'nickname-last',
    })
  })
})

describe('nameSchema', () => {
  it('refuses a name above 100 characters and a nickname above 50', () => {
    expect(nameSchema.safeParse({ ...name, firstName: 'x'.repeat(101) }).success).toBe(false)
    expect(nameSchema.safeParse({ ...name, lastName: 'x'.repeat(101) }).success).toBe(false)
    expect(nameSchema.safeParse({ ...name, nickname: 'x'.repeat(51) }).success).toBe(false)
    expect(nameSchema.safeParse({ ...name, nickname: 'x'.repeat(50) }).success).toBe(true)
  })

  it('takes every part empty', () => {
    expect(nameSchema.safeParse(name).success).toBe(true)
  })
})

// docs/specs/0016-public-profile.md, N7.
describe('nameProblem', () => {
  const problemOf = (field: 'firstName' | 'nickname' | 'lastName', value: string) => {
    const parsed = nameSchema.safeParse({ ...name, [field]: value })
    const issue = parsed.success ? undefined : parsed.error.issues[0]
    return nameProblem(issue && { type: issue.code })
  }

  it('tells a part that is too long from one that holds a hidden character', () => {
    expect(problemOf('nickname', 'x'.repeat(51))).toBe('too-long')
    expect(problemOf('nickname', `Li${String.fromCodePoint(0x202e)}sek`)).toBe('hidden-character')
    expect(problemOf('firstName', `An${String.fromCodePoint(7)}na`)).toBe('hidden-character')
  })

  it('finds no problem in a part that is fine', () => {
    expect(problemOf('lastName', 'Nowak')).toBeUndefined()
  })
})
