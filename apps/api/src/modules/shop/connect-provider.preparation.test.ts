import { describe, expect, it, vi } from 'vitest'
import { type TenantContextService } from '../../common/als/tenant-context.service'
import { type RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { FakeProvider } from '../payments/fake-provider'
import { PaymentProviders } from '../payments/payment-providers'
import { ConnectProviderPreparation } from './connect-provider.preparation'

describe('ConnectProviderPreparation', () => {
  const consume = vi.fn()
  const preparation = (providers: PaymentProviders) =>
    new ConnectProviderPreparation(
      providers,
      { tenant: () => ({ id: 't1' }) } as unknown as TenantContextService,
      { consume } as unknown as RouteRateLimiter,
    )

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
