import { Injectable, type NestMiddleware } from '@nestjs/common'
import { normalizeIp } from '@nestjs/throttler'
import { TenantContextService } from './tenant-context.service'

const IPV4_MAPPED = /^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i

/**
 * Opens a request store for every request, holding only the client address that `trust proxy`
 * takes from X-Forwarded-For, in full and by its /64; nothing reads the database here.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly context: TenantContextService) {}

  use(req: { ip?: string }, _res: unknown, next: () => void) {
    const ip = req.ip?.replace(IPV4_MAPPED, '')
    this.context.run(next, normalizeIp(String(req.ip)), ip)
  }
}
