import { Controller, Get, Inject, Res } from '@nestjs/common'
import { type HealthStatus } from '@opos/contract'
import { type Database } from '@opos/db'
import { sql } from 'drizzle-orm'
import { APP_DB } from '../../common/database/tokens'

// A plain Nest route, documented by contract.health.check: oRPC answers a status outside 2xx only
// for an error, and the 503 here carries the same body as the 200.
@Controller()
export class HealthController {
  constructor(@Inject(APP_DB) private readonly db: Database) {}

  @Get('health')
  async check(
    @Res({ passthrough: true }) res: { status(code: number): unknown },
  ): Promise<HealthStatus> {
    try {
      await this.db.execute(sql`select 1`)
      return { status: 'ok', database: 'up' }
    } catch {
      res.status(503)
      return { status: 'unavailable', database: 'down' }
    }
  }
}
