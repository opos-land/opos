import { Injectable, type NestMiddleware } from '@nestjs/common'
import { normalizeIp } from '@nestjs/throttler'
import { TenantContextService } from './tenant-context.service'

/**
 * Opens a request store for every request, holding only the client address that `trust proxy`
 * takes from X-Forwarded-For; nothing reads the database here.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly context: TenantContextService) {}

  use(req: { ip?: string }, _res: unknown, next: () => void) {
    this.context.run(next, normalizeIp(String(req.ip)))
  }
}
