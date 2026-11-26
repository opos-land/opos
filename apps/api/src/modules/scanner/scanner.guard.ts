import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SkipThrottle } from '@nestjs/throttler'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { ApiError } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { hashOf } from '../checkout/codes'
import { scannerRevoked } from './scanner.errors'

const SCANNER_LIMIT = 'scannerLimit'

/** The limit of a scanner's route, counted against the scanner. */
type ScannerLimit = 'scannerScans' | 'scannerHandOuts'

const refusedAsNoScanner = (error: unknown) =>
  error instanceof ApiError && error.code === 'scanner.revoked'

/**
 * Names the scanner of a request by the device's token in `Authorization: Bearer`, before
 * anything of the request is read: no token and an unknown one answer alike, and tell nothing
 * of the body. The token is looked up across tenants by its hash, which answers the scanner and
 * its tenant alone; whether the device still stands, and still holds that token, is judged in
 * that tenant's transaction.
 *
 * It counts the request too, in place of the default rate limit: against the scanner the token
 * names, under the limit of the route, or against the client address when the token names none.
 * An address out of those is refused before a token is looked up.
 */
@Injectable()
export class ScannerGuard implements CanActivate {
  constructor(
    private readonly global: GlobalDbService,
    private readonly context: TenantContextService,
    private readonly rateLimiter: RouteRateLimiter,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const { headers } = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    const authorization = typeof headers.authorization === 'string' ? headers.authorization : ''
    const scanner = await this.rateLimiter.counting(
      'scannerRefusals',
      `ip:${this.context.clientAddress()}`,
      async () => {
        const token = /^Bearer (\S+)$/.exec(authorization)?.[1]
        if (!token) throw scannerRevoked()
        const tokenHash = hashOf(token)
        const found = await this.global.scannerByToken(tokenHash)
        if (!found) throw scannerRevoked()
        return { ...found, tokenHash }
      },
      refusedAsNoScanner,
    )
    const limit = this.reflector.get<ScannerLimit>(SCANNER_LIMIT, ctx.getHandler())
    await this.rateLimiter.consume(limit, `scanner:${scanner.id}`)
    this.context.setScanner(scanner)
    return true
  }
}

/**
 * A route a scanner calls: ScannerGuard names the scanner and counts the request against
 * `limit`, the scanner's own, and the default rate limit is skipped. That one counts by the
 * client address, which the scanners of a venue share with each other and with its visitors.
 */
export const AsScanner = (limit: ScannerLimit): MethodDecorator =>
  applyDecorators(SkipThrottle(), SetMetadata(SCANNER_LIMIT, limit), UseGuards(ScannerGuard))
