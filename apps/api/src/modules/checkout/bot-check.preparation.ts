import { Inject, Injectable } from '@nestjs/common'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { type Preparation } from '../../common/decorators/prepares.decorator'
import { BOT_CHECK, type BotCheck } from './bot-check'

/**
 * The bot check of an order an account places, before the route's transaction: verifying asks the
 * check's vendor, a call out. It answers whether the check passed; the route refuses the order
 * when it did not.
 */
@Injectable()
export class BotCheckPreparation implements Preparation<boolean> {
  constructor(
    @Inject(BOT_CHECK) private readonly botCheck: BotCheck,
    private readonly context: TenantContextService,
  ) {}

  prepare(body: unknown): Promise<boolean> {
    const token = (body as { botCheckToken?: unknown } | null)?.botCheckToken
    if (typeof token !== 'string' || token === '') return Promise.resolve(false)
    return this.botCheck.verify(token, this.context.clientAddress())
  }
}
