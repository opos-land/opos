import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService, type JobScope } from '../../common/database/global-db.service'
import { OrdersRepository } from '../checkout/orders.repository'
import { reminderWindow } from './reminder-window'
import { RemindersRepository } from './reminders.repository'

/** How often the job looks for editions whose reminder is due. */
const REMINDERS_EVERY_MS = 5 * 60_000

/** What one run did: the editions whose reminder it queued, and the emails that made. */
export interface RemindersResult {
  editions: number
  queued: number
}

/**
 * The job of the pre-edition reminder (docs/specs/0011-pre-edition-reminder.md): it finds the
 * editions whose reminder may be due and, in each edition's own tenant transaction, queues one
 * email a QR code and notes that the reminder went out, so a reminder is queued whole or not at
 * all. The emails' outbox sends them. Several API processes may run it at once: the row of the
 * edition's shop is locked, and the second process finds the reminder gone out.
 */
@Injectable()
export class PreEditionReminders implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PreEditionReminders.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly global: GlobalDbService,
    private readonly reminders: RemindersRepository,
    private readonly orders: OrdersRepository,
    private readonly context: TenantContextService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return
    const run = () => {
      this.run()
        .catch((error: unknown) => this.logger.error(`The reminders failed: ${String(error)}`))
        .finally(() => (this.timer = setTimeout(run, REMINDERS_EVERY_MS).unref()))
    }
    this.timer = setTimeout(run, REMINDERS_EVERY_MS).unref()
  }

  onApplicationShutdown() {
    clearTimeout(this.timer)
  }

  /** One run over the editions whose reminder is due at `now`. */
  async run(now = new Date(), scope: JobScope = {}): Promise<RemindersResult> {
    const result: RemindersResult = { editions: 0, queued: 0 }
    for (const found of await this.global.remindersPending(now, scope)) {
      try {
        const queued = await this.one(found, now)
        if (queued !== undefined) {
          result.editions += 1
          result.queued += queued
        }
      } catch (error) {
        // One edition that cannot be taken, such as one of a tenant suspended meanwhile, leaves
        // the rest. Only the error's name reaches the log.
        const name = error instanceof Error ? error.name : 'unknown failure'
        this.logger.warn(`The reminder of the edition ${found.editionId} waits: ${name}`)
      }
    }
    return result
  }

  /** Queues the reminder of one edition when it is due; undefined when it is not, or went out. */
  private one(
    found: { tenantId: string; editionId: string; timezone: string },
    now: Date,
  ): Promise<number | undefined> {
    const { tenantId, editionId } = found
    return this.context.withTenant(tenantId, async () => {
      const pending = await this.reminders.pending(tenantId, editionId)
      if (!pending) return undefined
      const { from, until } = reminderWindow(pending.startsAt, pending.daysBefore, found.timezone)
      // Before its hour, or after its day: a reminder missed on its day is not sent late.
      if (now.getTime() < from.getTime() || now.getTime() >= until.getTime()) return undefined
      const recipients = await this.reminders.recipients(tenantId, editionId)
      for (const { orderId, email } of recipients) {
        await this.orders.queueEmail(
          { tenantId, editionId, orderId },
          'pre-edition-reminder',
          email,
        )
      }
      await this.reminders.sent(tenantId, editionId, now)
      return recipients.length
    })
  }
}
