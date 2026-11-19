import { PAYMENT_PROVIDERS } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import { credentialsBody, emptyCredentials, missingMessage, PROVIDERS } from './providers'

describe('the payment providers the panel knows', () => {
  it('describes every provider of the contract, each with a name', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([...PAYMENT_PROVIDERS].sort())
    for (const provider of PAYMENT_PROVIDERS) expect(PROVIDERS[provider].name).toBeTruthy()
  })

  it('asks the fake provider for its one field', () => {
    expect(PROVIDERS.fake.fields.map((field) => field.name)).toEqual(['account'])
    expect(emptyCredentials('fake')).toEqual({ account: '' })
  })

  it('carries the fields of the chosen provider, trimmed, and nothing else', () => {
    expect(credentialsBody('fake', { account: ' demo ', merchant: 'left from another' })).toEqual({
      provider: 'fake',
      credentials: { account: 'demo' },
    })
  })

  it('carries nothing while a field is empty', () => {
    expect(credentialsBody('fake', { account: '  ' })).toBeNull()
    expect(credentialsBody('fake', {})).toBeNull()
  })

  it('words the conditions it knows, and leaves another to its code', () => {
    expect(missingMessage('fake.not-ready')).not.toBeNull()
    expect(missingMessage('provider.not-loaded')).not.toBeNull()
    expect(missingMessage('przelewy24.something-new')).toBeNull()
  })
})
