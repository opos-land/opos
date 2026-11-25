import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type TenantContextService } from '../../common/als/tenant-context.service'
import { type RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { FAKE_ACCOUNT, FakeProvider } from '../payments/fake-provider'
import { type CredentialsVault, PaymentProviders } from '../payments/payment-providers'
import { ConnectProviderPreparation } from './connect-provider.preparation'
import { type ProviderAccountRepository } from './provider-account.repository'

/** What the convention has stored: its account, sealed, and whether a payment is under way. */
interface Stored {
  account?: { provider: 'fake' | 'przelewy24'; credentials: string }
  underWay?: boolean
}

describe('ConnectProviderPreparation', () => {
  const consume = vi.fn()
  beforeEach(() => consume.mockClear())
  const preparation = (providers: PaymentProviders, { account, underWay = false }: Stored = {}) =>
    new ConnectProviderPreparation(
      providers,
      {
        tenant: () => ({ id: 't1' }),
        withTenant: (_: string, fn: () => Promise<unknown>) => fn(),
      } as unknown as TenantContextService,
      { consume } as unknown as RouteRateLimiter,
      {
        find: () => Promise.resolve(account),
        paymentsUnderWay: () => Promise.resolve(underWay),
      } as unknown as ProviderAccountRepository,
      // Sealed, the credentials are their JSON here: anything else opens nothing.
      {
        open: (_: unknown, sealed: string) => JSON.parse(sealed) as Record<string, string>,
      } as unknown as CredentialsVault,
    )
  const sealed = (account: string) => JSON.stringify({ account })

  /** Connects `another` over what is stored, and says what the provider was asked about. */
  async function replacing(stored: Stored) {
    const fake = new FakeProvider()
    const asked = vi.spyOn(fake, 'connect')
    const checked = await preparation(
      new PaymentProviders(new Map([['fake', fake]])),
      stored,
    ).prepare({ provider: 'fake', credentials: { account: 'another' } })
    return { checked, asked: asked.mock.calls.map(([credentials]) => credentials.account) }
  }

  it('judges nothing stored while the convention has no account', async () => {
    const { checked, asked } = await replacing({ underWay: true })

    expect(checked).toMatchObject({ provider: 'fake', answer: { outcome: 'ready' } })
    expect(checked.stored).toBeUndefined()
    expect(asked).toEqual(['another'])
  })

  // The three accounts that give way while a payment is under way: the same one given again, one
  // whose credentials no longer open, and one its provider refuses.
  it('lets the stored credentials give way to new ones of the same account, asking nothing of them', async () => {
    const { checked, asked } = await replacing({
      account: { provider: 'fake', credentials: sealed('another') },
      underWay: true,
    })

    expect(checked.stored).toEqual({ credentials: sealed('another'), givesWay: true })
    expect(asked).toEqual(['another'])
  })

  it('lets stored credentials that no longer open give way, asking nothing of them', async () => {
    const { checked, asked } = await replacing({
      account: { provider: 'fake', credentials: 'sealed with a key that is gone' },
      underWay: true,
    })

    expect(checked.stored).toMatchObject({ givesWay: true })
    expect(asked).toEqual(['another'])
  })

  it('lets stored credentials the provider refuses give way', async () => {
    const { checked, asked } = await replacing({
      account: { provider: 'fake', credentials: sealed(FAKE_ACCOUNT.refused) },
      underWay: true,
    })

    expect(checked.stored).toEqual({ credentials: sealed(FAKE_ACCOUNT.refused), givesWay: true })
    expect(asked).toEqual(['another', FAKE_ACCOUNT.refused])
  })

  it.each([
    ['the provider accepts', 'demo'],
    // Out of reach is no refusal: whether the account still stands is not known.
    ['the provider does not answer about', FAKE_ACCOUNT.unavailable],
  ])('keeps stored credentials of another account that %s', async (_, account) => {
    const { checked, asked } = await replacing({
      account: { provider: 'fake', credentials: sealed(account) },
      underWay: true,
    })

    expect(checked.stored).toEqual({ credentials: sealed(account), givesWay: false })
    expect(asked).toEqual(['another', account])
  })

  it('asks the provider nothing about the stored credentials while no payment is under way', async () => {
    const { checked, asked } = await replacing({
      account: { provider: 'fake', credentials: sealed(FAKE_ACCOUNT.refused) },
    })

    expect(checked.stored).toMatchObject({ givesWay: false })
    expect(asked).toEqual(['another'])
  })

  // Production loads no fake provider: no credentials there connect an account that takes no
  // money, and nothing is asked of anyone, nor counted against the convention's checks.
  it('refuses a provider this environment has no module of, before anything is asked', async () => {
    const noFake = preparation(new PaymentProviders(new Map()))

    await expect(
      noFake.prepare({ provider: 'fake', credentials: { account: 'demo' } }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'request.invalid',
      params: { field: 'provider' },
    })
    expect(consume).not.toHaveBeenCalled()
  })

  it('refuses a body that is no provider account, naming its first field that is not', async () => {
    const withFake = preparation(new PaymentProviders(new Map([['fake', new FakeProvider()]])))

    await expect(withFake.prepare({ provider: 'cash', credentials: {} })).rejects.toMatchObject({
      status: 400,
      params: { field: 'provider' },
    })
    await expect(withFake.prepare({ provider: 'fake' })).rejects.toMatchObject({
      params: { field: 'credentials' },
    })
  })
})
