import { Controller } from '@nestjs/common'
import { contract, RESULT_TOKEN_HEADER } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { notFound, suspendedAsNotFound } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { CredentialsVault, PaymentProviders } from '../payments/payment-providers'
import { type Credentials } from '../payments/provider'
import { PublicConvention } from '../public/public-convention'
import { PaymentAttempts } from './payment-attempts.service'
import { attemptOf, PaymentConfirmations } from './payment-confirmations.service'
import { PaymentsRepository } from './payments.repository'

/**
 * Paying for an order, without sign-in (docs/specs/0004-checkout-and-orders.md): the result page
 * and the start of an attempt, which open with the order's result token, and what a provider
 * tells the API of an attempt. No handler here runs in a transaction of its own: each opens its
 * tenant's, and asks a provider between them.
 */
@Controller()
export class PaymentsController {
  constructor(
    private readonly convention: PublicConvention,
    private readonly attempts: PaymentAttempts,
    private readonly confirmations: PaymentConfirmations,
    private readonly payments: PaymentsRepository,
    private readonly providers: PaymentProviders,
    private readonly vault: CredentialsVault,
    private readonly global: GlobalDbService,
    private readonly limiter: RouteRateLimiter,
    private readonly context: TenantContextService,
  ) {}

  @Implement(contract.public.orderResult)
  orderResult() {
    return implement(contract.public.orderResult).handler(async ({ input }) => {
      const tenant = await this.convention.tenant(input.params.slug)
      return this.attempts
        .result(tenant, input.params.orderId, input.headers[RESULT_TOKEN_HEADER])
        .catch(suspendedAsNotFound('order'))
    })
  }

  @Implement(contract.public.startPaymentAttempt)
  startPaymentAttempt() {
    return implement(contract.public.startPaymentAttempt).handler(async ({ input }) => {
      await this.limiter.consume('paymentAttempts', `ip:${this.context.clientAddress()}`)
      const tenant = await this.convention.tenant(input.params.slug)
      return this.attempts
        .start(
          tenant,
          input.params.orderId,
          { token: input.headers[RESULT_TOKEN_HEADER] },
          input.headers['accept-language'],
        )
        .catch(suspendedAsNotFound('order'))
    })
  }

  @Implement(contract.payments.notification)
  notification() {
    return implement(contract.payments.notification).handler(({ input }) =>
      this.take(input.params, input.body, false),
    )
  }

  @Implement(contract.payments.additionalNotification)
  additionalNotification() {
    return implement(contract.payments.additionalNotification).handler(({ input }) =>
      this.take(input.params, input.body, true),
    )
  }

  /**
   * Takes what a provider tells of an attempt. The address names the attempt alone, so its tenant
   * comes from one cross-tenant lookup that answers nothing else; nothing counts before the
   * signature holds, which the module judges with the credentials of the tenant's own account.
   * An attempt that is not there, another provider's, a suspended convention's and a notification
   * whose signature does not hold all answer as an unknown address, and change nothing.
   */
  private async take(
    address: { provider: string; attemptId: string },
    body: unknown,
    additional: boolean,
  ) {
    const found = await this.global.paymentAttempt(address.attemptId)
    if (!found || found.provider !== address.provider) throw notFound('address')
    const { tenantId } = found
    const notification = await this.context
      .withTenant(tenantId, async () => {
        const attempt = await this.payments.attempt(address.attemptId)
        const order = attempt && (await this.payments.order(tenantId, attempt.orderId))
        const account = await this.payments.providerAccount(tenantId)
        if (!attempt || !order || account?.provider !== attempt.provider) return undefined
        let credentials: Credentials
        try {
          credentials = this.vault.open(
            { tenantId, provider: account.provider },
            account.credentials,
          )
        } catch {
          // Credentials this API can no longer open judge no signature.
          return undefined
        }
        const read = this.providers.read(
          attempt.provider,
          credentials,
          attemptOf(order, attempt),
          body,
          additional,
        )
        if (read?.kind === 'failure') await this.payments.fail(attempt.id, read)
        return read
      })
      .catch(suspendedAsNotFound('address'))
    if (!notification) throw notFound('address')
    if (notification.kind === 'payment') {
      await this.confirmations
        .take(tenantId, address.attemptId, notification.payment)
        .catch(suspendedAsNotFound('address'))
    }
    return {}
  }
}
