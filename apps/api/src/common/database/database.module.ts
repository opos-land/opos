import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
import { appDb, globalDb, type Database } from '@opos/db'
import { ENV, type Env } from '../../config/env'
import { GlobalDbService } from './global-db.service'
import { APP_DB, GLOBAL_DB } from './tokens'

@Global()
@Module({
  providers: [
    { provide: APP_DB, inject: [ENV], useFactory: (env: Env) => appDb(env.DATABASE_URL) },
    {
      provide: GLOBAL_DB,
      inject: [ENV],
      useFactory: (env: Env) => globalDb(env.DATABASE_GLOBAL_URL),
    },
    GlobalDbService,
  ],
  // GLOBAL_DB stays inside this module: cross-tenant reads go through GlobalDbService only.
  exports: [APP_DB, GlobalDbService],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(APP_DB) private readonly app: Database,
    @Inject(GLOBAL_DB) private readonly global: Database,
  ) {}

  async onApplicationShutdown() {
    await Promise.all([this.app.$client.end(), this.global.$client.end()])
  }
}
