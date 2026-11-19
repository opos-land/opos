import { describe, expect, it } from 'vitest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { FAKE_ACCOUNT } from './fake-provider'
import { CredentialsVault, PaymentProviders, providerModules } from './payment-providers'

const context = new TenantContextService({} as never)
const providers = new PaymentProviders(providerModules({ OPOS_ENV: 'local' }))

describe('providerModules', () => {
  it.each(['local', 'dev'] as const)('loads the fake provider on %s', (OPOS_ENV) => {
    expect([...providerModules({ OPOS_ENV }).keys()]).toContain('fake')
  })

  it('loads no fake provider on production', () => {
    expect([...providerModules({ OPOS_ENV: 'production' }).keys()]).not.toContain('fake')
  })
})

describe('PaymentProviders', () => {
  const connect = (account: string) =>
    context.run(() => providers.connect('fake', { account }), '127.0.0.1')

  it('answers ready for credentials the provider accepts with nothing missing', async () => {
    expect(await connect('demo')).toEqual({ outcome: 'ready' })
  })

  it('answers not ready, with what is missing, for credentials accepted short of a condition', async () => {
    expect(await connect(FAKE_ACCOUNT.notReady)).toEqual({
      outcome: 'not-ready',
      missing: ['fake.not-ready'],
    })
  })

  it('answers refused and out of reach as the provider does', async () => {
    expect(await connect(FAKE_ACCOUNT.refused)).toEqual({ outcome: 'refused' })
    expect(await connect(FAKE_ACCOUNT.unavailable)).toMatchObject({ outcome: 'unavailable' })
  })

  it('answers that a provider with no module loaded is none it knows', async () => {
    expect(
      await context.run(() => providers.connect('przelewy24', { a: 'b' }), '127.0.0.1'),
    ).toEqual({ outcome: 'unknown-provider' })
    expect(providers.loaded('przelewy24')).toBe(false)
    expect(providers.loaded('fake')).toBe(true)
  })

  it('answers a module that throws as a provider out of reach, naming the error and nothing it said', async () => {
    const module = {
      name: 'fake' as const,
      connect: () => Promise.reject(new TypeError('refused for key=my-secret')),
      missing: () => [],
    }
    const failing = new PaymentProviders(new Map([['fake', module]]))

    const answer = await context.run(
      () => failing.connect('fake', { account: 'my-secret' }),
      '127.0.0.1',
    )

    expect(answer).toEqual({
      outcome: 'unavailable',
      reason: "the provider's module threw TypeError",
    })
    expect(JSON.stringify(answer)).not.toContain('my-secret')
  })

  it('names the providers the environment has a module of: none on production', () => {
    expect(providers.names()).toEqual(['fake'])
    expect(new PaymentProviders(providerModules({ OPOS_ENV: 'production' })).names()).toEqual([])
  })

  // A provider's call is outbound I/O, which never runs inside a transaction
  // (docs/ARCHITECTURE.md, API conventions).
  it('refuses to call a provider inside a transaction', async () => {
    await expect(
      context.run(() => {
        TenantContextService.store().tx = {} as never
        return providers.connect('fake', { account: 'demo' })
      }, '127.0.0.1'),
    ).rejects.toThrow(/outside every transaction/)
  })

  it('names what stored credentials still miss without calling anyone, also inside a transaction', () => {
    expect(providers.missing('fake', { account: FAKE_ACCOUNT.notReady })).toEqual([
      'fake.not-ready',
    ])
    expect(providers.missing('fake', { account: 'demo' })).toEqual([])
    expect(providers.missing('przelewy24', { a: 'b' })).toEqual(['provider.not-loaded'])
  })
})

describe('CredentialsVault', () => {
  const vault = new CredentialsVault({ PAYMENT_CREDENTIALS_KEY: 'k'.repeat(64) })

  it('opens the credentials it sealed, and shows none of them sealed', () => {
    const sealed = vault.seal({ merchant: '12345', crc: 'top-secret-crc' })

    expect(sealed).not.toContain('top-secret-crc')
    expect(sealed).not.toContain('12345')
    expect(vault.open(sealed)).toEqual({ merchant: '12345', crc: 'top-secret-crc' })
  })

  it('does not open what another key sealed', () => {
    const other = new CredentialsVault({ PAYMENT_CREDENTIALS_KEY: 'o'.repeat(64) })

    expect(() => vault.open(other.seal({ account: 'demo' }))).toThrow(/could not be opened/)
  })
})
