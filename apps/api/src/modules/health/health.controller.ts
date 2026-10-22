import { Controller, Inject } from '@nestjs/common'
import { contract } from '@opos/contract'
import { type Database } from '@opos/db'
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest'
import { sql } from 'drizzle-orm'
import { APP_DB } from '../../common/database/database.module'

@Controller()
export class HealthController {
  constructor(@Inject(APP_DB) private readonly db: Database) {}

  @TsRestHandler(contract.health.check)
  check() {
    return tsRestHandler(contract.health.check, async () => {
      try {
        await this.db.execute(sql`select 1`)
        return { status: 200, body: { status: 'ok', database: 'up' } }
      } catch {
        return { status: 503, body: { status: 'unavailable', database: 'down' } }
      }
    })
  }
}
