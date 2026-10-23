import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import { TenantContextMiddleware } from './common/als/tenant-context.middleware'
import { TenantContextService } from './common/als/tenant-context.service'
import { TenantTransactionInterceptor } from './common/als/tenant-transaction.interceptor'
import { DatabaseModule } from './common/database/database.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { AccessRepository } from './common/permissions/access.repository'
import { ENV, type Env } from './config/env'
import { MeModule } from './modules/accounts/me.module'
import { HealthModule } from './modules/health/health.module'
import { TenantsModule } from './modules/tenants/tenants.module'

@Module({})
export class AppModule implements NestModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [DatabaseModule, HealthModule, MeModule, TenantsModule],
      providers: [
        { provide: ENV, useValue: env },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor },
        TenantContextService,
        AccessRepository,
      ],
      exports: [ENV, TenantContextService],
    }
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL })
  }
}
