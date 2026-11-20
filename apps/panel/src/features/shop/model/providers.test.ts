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

  // The merchant's and the point of sale's identifiers, the two keys, and the org's two answers.
  it('asks Przelewy24 for its identifiers, its keys and two answers of the org', () => {
    expect(
      PROVIDERS.przelewy24.fields.map((field) => [field.name, field.kind ?? 'secret']),
    ).toEqual([
      ['merchantId', 'text'],
      ['posId', 'text'],
      ['crc', 'secret'],
      ['apiKey', 'secret'],
      ['sandbox', 'choice'],
      ['abandonedPaymentEmailOff', 'choice'],
    ])
    // An answer is a no until it is ticked; nothing else is filled in.
    expect(emptyCredentials('przelewy24')).toEqual({
      merchantId: '',
      posId: '',
      crc: '',
      apiKey: '',
      sandbox: 'false',
      abandonedPaymentEmailOff: 'false',
    })
    // Przelewy24 answers only to the addresses entered in its panel: the org is shown which.
    expect(PROVIDERS.przelewy24.needsAddress).toBe(true)
    expect(PROVIDERS.fake.needsAddress).toBeFalsy()
  })

  it('carries an answer of the org as a yes or a no, ticked or not', () => {
    const typed = { merchantId: ' 123 ', posId: '123', crc: 'c', apiKey: 'k' }

    expect(credentialsBody('przelewy24', typed)).toEqual({
      provider: 'przelewy24',
      credentials: {
        merchantId: '123',
        posId: '123',
        crc: 'c',
        apiKey: 'k',
        sandbox: 'false',
        abandonedPaymentEmailOff: 'false',
      },
    })
    expect(
      credentialsBody('przelewy24', { ...typed, abandonedPaymentEmailOff: 'true' })?.credentials,
    ).toMatchObject({ sandbox: 'false', abandonedPaymentEmailOff: 'true' })
    expect(credentialsBody('przelewy24', { ...typed, crc: ' ' })).toBeNull()
  })

  it('words the conditions it knows, and leaves another to its code', () => {
    expect(missingMessage('fake.not-ready')).not.toBeNull()
    expect(missingMessage('provider.not-loaded')).not.toBeNull()
    expect(missingMessage('credentials.unreadable')).not.toBeNull()
    expect(missingMessage('przelewy24.abandoned-payment-email-on')).not.toBeNull()
    expect(missingMessage('przelewy24.credentials-invalid')).not.toBeNull()
    expect(missingMessage('przelewy24.something-new')).toBeNull()
  })
})
