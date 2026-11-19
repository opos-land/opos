import { SetMetadata, type Type } from '@nestjs/common'

export const PREPARES = Symbol('PREPARES')

/**
 * What a tenant route at `write` does before its transaction: outbound I/O whose answer the
 * transaction then acts on, such as a payment provider's check of credentials. It takes the
 * request's body as it came, before the contract has validated it, and validates what it reads.
 */
export interface Preparation<T = unknown> {
  prepare(body: unknown): Promise<T>
}

/**
 * A tenant route at `write` that calls out before its transaction: once its requirement passed,
 * the preparation runs outside every transaction, and the route's own transaction reads its
 * answer through TenantContextService.prepared(). Outbound I/O never runs inside a transaction
 * (docs/ARCHITECTURE.md, API conventions).
 */
export const Prepares = (preparation: Type<Preparation>): MethodDecorator =>
  SetMetadata(PREPARES, preparation)
