import { Injectable, type NestMiddleware } from '@nestjs/common'
import { TenantContextService } from './tenant-context.service'

/** Opens an empty request store for every request; nothing reads the database here. */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly context: TenantContextService) {}

  use(_req: unknown, _res: unknown, next: () => void) {
    this.context.run(next)
  }
}
