import { type DynamicModule, Module } from '@nestjs/common'
import { DatabaseModule } from './common/database/database.module'
import { ENV, type Env } from './config/env'
import { HealthModule } from './modules/health/health.module'

@Module({})
export class AppModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [DatabaseModule, HealthModule],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    }
  }
}
