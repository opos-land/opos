import { Injectable } from '@nestjs/common'
import { type PaymentProvider, putProviderAccountSchema } from '@opos/contract'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { type Preparation } from '../../common/decorators/prepares.decorator'
import { ApiError } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { PaymentProviders } from '../payments/payment-providers'
import { type ConnectAnswer, type Credentials } from '../payments/provider'

/** The credentials an org gave and what their provider said of them. */
export interface CheckedCredentials {
  provider: PaymentProvider
  credentials: Credentials
  answer: Exclude<ConnectAnswer, { outcome: 'unknown-provider' }>
}

/**
 * Before the transaction that connects a provider account: the credentials are checked with the
 * provider, a call out that no transaction waits for. The body is read as it came, so it is
 * validated here as the contract validates it again inside the route.
 */
@Injectable()
export class ConnectProviderPreparation implements Preparation<CheckedCredentials> {
  constructor(
    private readonly providers: PaymentProviders,
    private readonly context: TenantContextService,
    private readonly limiter: RouteRateLimiter,
  ) {}

  async prepare(body: unknown): Promise<CheckedCredentials> {
    const parsed = putProviderAccountSchema.safeParse(body)
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? 'body')
      throw new ApiError(400, 'request.invalid', 'The provider account is malformed', { field })
    }
    const { provider, credentials } = parsed.data
    // A provider OPOS knows, with no module loaded in this environment.
    const unknown = () =>
      new ApiError(400, 'request.invalid', 'This provider is not available here', {
        field: 'provider',
      })
    if (!this.providers.loaded(provider)) throw unknown()
    // The provider sees every check as coming from OPOS: a convention spends only so many, so
    // that guessed credentials never get OPOS throttled for every other convention.
    await this.limiter.consume('providerConnects', `tenant:${this.context.tenant().id}`)
    const answer = await this.providers.connect(provider, credentials)
    if (answer.outcome === 'unknown-provider') throw unknown()
    return { provider, credentials, answer }
  }
}
