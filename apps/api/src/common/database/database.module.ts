import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
import { appDb, globalDb, type Database } from '@opos/db'
import { ENV, type Env } from '../../config/env'

export const APP_DB = Symbol('APP_DB')
export const GLOBAL_DB = Symbol('GLOBAL_DB')

@Global()
@Module({
  providers: [
    { provide: APP_DB, inject: [ENV], useFactory: (env: Env) => appDb(env.DATABASE_URL) },
    {
      provide: GLOBAL_DB,
      inject: [ENV],
      useFactory: (env: Env) => globalDb(env.DATABASE_GLOBAL_URL),
    },
  ],
  exports: [APP_DB, GLOBAL_DB],
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
