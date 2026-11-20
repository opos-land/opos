import { describe, expect, it } from 'vitest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { FAKE_ACCOUNT, FakeProvider } from './fake-provider'
import { CredentialsVault, PaymentProviders, providerModules } from './payment-providers'

const API_URL = 'https://api.test/'
const context = new TenantContextService({} as never)
const providers = new PaymentProviders(providerModules({ OPOS_ENV: 'local', API_URL }))

describe('providerModules', () => {
  it.each(['local', 'dev'] as const)('loads the fake provider on %s', (OPOS_ENV) => {
    expect([...providerModules({ OPOS_ENV, API_URL }).keys()]).toContain('fake')
  })

  it('loads no fake provider on production', () => {
    expect([...providerModules({ OPOS_ENV: 'production', API_URL }).keys()]).not.toContain('fake')
  })

  // The first real provider is there wherever the API runs.
  it.each(['local', 'dev', 'production'] as const)('loads Przelewy24 on %s', (OPOS_ENV) => {
    expect([...providerModules({ OPOS_ENV, API_URL }).keys()]).toContain('przelewy24')
  })

  it('connects no sandbox account of Przelewy24 on production, before anything is asked', async () => {
    const sandbox = {
      merchantId: '1',
      posId: '1',
      crc: 'c',
      apiKey: 'k',
      sandbox: 'true',
      abandonedPaymentEmailOff: 'true',
    }
    const production = providerModules({ OPOS_ENV: 'production', API_URL }).get('przelewy24')!

    expect(await production.connect(sandbox)).toEqual({ outcome: 'refused' })
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
    // An environment that loads the fake provider alone.
    const fakeAlone = new PaymentProviders(new Map([['fake', new FakeProvider()]]))

    expect(
      await context.run(() => fakeAlone.connect('przelewy24', { a: 'b' }), '127.0.0.1'),
    ).toEqual({ outcome: 'unknown-provider' })
    expect(fakeAlone.loaded('przelewy24')).toBe(false)
    expect(fakeAlone.loaded('fake')).toBe(true)
    expect(providers.loaded('przelewy24')).toBe(true)
  })

  it('answers a module that throws as a provider out of reach, naming the error and nothing it said', async () => {
    const module = Object.assign(new FakeProvider(), {
      connect: () => Promise.reject(new TypeError('refused for key=my-secret')),
    })
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

  it('names the providers the environment has a module of: no fake one on production', () => {
    expect(providers.names()).toEqual(['fake', 'przelewy24'])
    expect(
      new PaymentProviders(providerModules({ OPOS_ENV: 'production', API_URL })).names(),
    ).toEqual(['przelewy24'])
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
    expect(
      new PaymentProviders(new Map([['fake', new FakeProvider()]])).missing('przelewy24', {
        a: 'b',
      }),
    ).toEqual(['provider.not-loaded'])
    // Credentials that name no account of Przelewy24 miss just that.
    expect(providers.missing('przelewy24', { a: 'b' })).toEqual(['przelewy24.credentials-invalid'])
  })
})

describe('CredentialsVault', () => {
  const vault = new CredentialsVault({ PAYMENT_CREDENTIALS_KEY: 'k'.repeat(64) })

  const mine = { tenantId: '0198c1a0-0000-7000-8000-00000000000a', provider: 'fake' } as const

  it('opens the credentials it sealed, and shows none of them sealed', () => {
    const sealed = vault.seal(mine, { merchant: '12345', crc: 'top-secret-crc' })

    expect(sealed).not.toContain('top-secret-crc')
    expect(sealed).not.toContain('12345')
    expect(vault.open(mine, sealed)).toEqual({ merchant: '12345', crc: 'top-secret-crc' })
  })

  it('does not open what another key sealed', () => {
    const other = new CredentialsVault({ PAYMENT_CREDENTIALS_KEY: 'o'.repeat(64) })

    expect(() => vault.open(mine, other.seal(mine, { account: 'demo' }))).toThrow(
      /could not be opened/,
    )
  })

  // Credentials copied into the row of another convention, or kept under another provider, by
  // someone who writes the database and holds no key.
  it('does not open the credentials of another tenant, nor under another provider', () => {
    const sealed = vault.seal(mine, { account: 'demo' })

    expect(() =>
      vault.open({ ...mine, tenantId: '0198c1a0-0000-7000-8000-00000000000b' }, sealed),
    ).toThrow(/could not be opened/)
    expect(() => vault.open({ ...mine, provider: 'przelewy24' }, sealed)).toThrow(
      /could not be opened/,
    )
  })
})

describe('a payment asked of a provider', () => {
  const demo = { account: 'demo' }
  const attempt = { id: 'a1', amountMinor: 5000, currency: 'PLN', reference: 'ABCDEFGHJK' }
  const request = {
    ...attempt,
    description: 'Order ABCDEFGHJK',
    email: 'buyer@example.test',
    locale: 'en',
    returnUrl: 'https://portal.test/result',
    payableUntil: new Date('2026-05-01T10:30:00Z'),
    notificationUrl: 'https://api.test/payments/fake/notifications/a1',
    additionalNotificationUrl: 'https://api.test/payments/fake/notifications/a1/additional',
  }
  const payment = { paidAmountMinor: 5000, paidAt: new Date(), providerReference: 'FAKE-1' }
  const outside = <T>(ask: () => Promise<T>) => context.run(ask, '127.0.0.1')
  /** A module whose every call fails outright, with an error that quotes a secret. */
  const broken = () => {
    const fail = () => Promise.reject(new Error('sent secret-key to the provider'))
    const module = Object.assign(new FakeProvider(), {
      start: fail,
      settle: fail,
      refuse: fail,
      state: fail,
      information: fail,
    })
    return new PaymentProviders(new Map([['fake', module]]))
  }
  const none = new PaymentProviders(new Map())

  it('starts at the pay page of the fake provider, served at the API\u2019s own address', async () => {
    expect(await outside(() => providers.start('fake', demo, request))).toEqual({
      outcome: 'started',
      redirectUrl: 'https://api.test/payments/fake/pay/a1',
    })
  })

  it('reads a notification through the module, and nothing where no module is loaded', async () => {
    await outside(() => providers.start('fake', demo, request))
    const fake = providerOf(providers)
    const body = fake.pay('a1')

    expect(providers.read('fake', demo, attempt, body, false)).toMatchObject({ kind: 'payment' })
    expect(none.read('fake', demo, attempt, body, false)).toBeUndefined()
  })

  it('settles, refuses, tells the state and gives the information of a payment', async () => {
    await outside(() => providers.start('fake', demo, request))
    providerOf(providers).pay('a1')

    expect(await outside(() => providers.settle('fake', demo, attempt, payment))).toEqual({
      outcome: 'settled',
    })
    expect(await outside(() => providers.state('fake', demo, attempt))).toMatchObject({
      state: 'paid',
    })
    expect(await outside(() => providers.information('fake', demo, attempt, payment))).toEqual({
      transaction: 'FAKE-1',
    })
    expect(await outside(() => providers.refuse('fake', demo, attempt, payment))).toEqual({
      refused: true,
    })
    expect(providers.moneyWith('fake', 'buyer')).toHaveProperty('pl')
  })

  // A module that fails outright is a provider out of reach, and nothing of its error is passed
  // on: it may quote the request it sent.
  it('answers a module that throws as a provider out of reach', async () => {
    const providers = broken()

    for (const answer of [
      await outside(() => providers.start('fake', demo, request)),
      await outside(() => providers.settle('fake', demo, attempt, payment)),
    ]) {
      expect(answer).toMatchObject({ outcome: 'unavailable' })
      expect(JSON.stringify(answer)).not.toContain('secret-key')
    }
    const state = await outside(() => providers.state('fake', demo, attempt))
    expect(state).toMatchObject({ state: 'unavailable' })
    expect(JSON.stringify(state)).not.toContain('secret-key')
    // A payment that could not be refused stays with the convention; no information is none.
    expect(await outside(() => providers.refuse('fake', demo, attempt, payment))).toEqual({
      refused: false,
    })
    expect(await outside(() => providers.information('fake', demo, attempt, payment))).toEqual({})
  })

  it('answers a provider with no module here as one out of reach', async () => {
    expect(await outside(() => none.start('fake', demo, request))).toMatchObject({
      outcome: 'unavailable',
    })
    expect(await outside(() => none.settle('fake', demo, attempt, payment))).toMatchObject({
      outcome: 'unavailable',
    })
    expect(await outside(() => none.state('fake', demo, attempt))).toMatchObject({
      state: 'unavailable',
    })
    expect(await outside(() => none.refuse('fake', demo, attempt, payment))).toEqual({
      refused: false,
    })
    expect(none.moneyWith('fake', 'buyer')).toBeUndefined()
  })

  it.each(['start', 'settle', 'refuse', 'state', 'information'] as const)(
    'refuses to %s inside a transaction',
    async (call) => {
      const inside = () =>
        TenantContextService.store.call(TenantContextService) as unknown as { tx?: unknown }
      const ask = {
        start: () => providers.start('fake', demo, request),
        settle: () => providers.settle('fake', demo, attempt, payment),
        refuse: () => providers.refuse('fake', demo, attempt, payment),
        state: () => providers.state('fake', demo, attempt),
        information: () => providers.information('fake', demo, attempt, payment),
      }[call]

      await expect(
        context.run(() => {
          inside().tx = {}
          return ask()
        }, '127.0.0.1'),
      ).rejects.toThrow('outside every transaction')
    },
  )
})

/** The fake provider's own module, for what a test makes it do. */
function providerOf(providers: PaymentProviders) {
  return (providers as unknown as { modules: Map<string, FakeProvider> }).modules.get('fake')!
}
