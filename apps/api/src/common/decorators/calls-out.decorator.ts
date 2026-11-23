import { SetMetadata } from '@nestjs/common'

export const CALLS_OUT = Symbol('CALLS_OUT')

/**
 * A tenant route that asks no membership and calls out between its transactions, such as the
 * start of a payment attempt at its provider. Its session is judged in a short transaction, then
 * its handler runs outside every transaction and opens the tenant's own through
 * TenantContextService.withTenant. Outbound I/O never runs inside a transaction
 * (docs/ARCHITECTURE.md, API conventions).
 */
export const CallsOut = (): MethodDecorator => SetMetadata(CALLS_OUT, true)
