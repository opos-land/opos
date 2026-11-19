import { Injectable } from '@nestjs/common'
import { type PaymentProvider, putProviderAccountSchema } from '@opos/contract'
import { type Preparation } from '../../common/decorators/prepares.decorator'
import { ApiError } from '../../common/errors/api-error'
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
  constructor(private readonly providers: PaymentProviders) {}

  async prepare(body: unknown): Promise<CheckedCredentials> {
    const parsed = putProviderAccountSchema.safeParse(body)
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? 'body')
      throw new ApiError(400, 'request.invalid', 'The provider account is malformed', { field })
    }
    const { provider, credentials } = parsed.data
    const answer = await this.providers.connect(provider, credentials)
    if (answer.outcome === 'unknown-provider') {
      // A provider OPOS knows, with no module loaded in this environment.
      throw new ApiError(400, 'request.invalid', 'This provider is not available here', {
        field: 'provider',
      })
    }
    return { provider, credentials, answer }
  }
}
