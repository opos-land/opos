import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import { ORPCModule } from '@orpc/nest'
import { experimental_RethrowHandlerPlugin as RethrowHandlerPlugin } from '@orpc/server/plugins'
import { deferResponseInTenantTransaction } from './common/als/defer-response'
import { TenantContextMiddleware } from './common/als/tenant-context.middleware'
import { TenantContextService } from './common/als/tenant-context.service'
import { TenantTransactionInterceptor } from './common/als/tenant-transaction.interceptor'
import { DatabaseModule } from './common/database/database.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { AccessRepository } from './common/permissions/access.repository'
import { ENV, type Env } from './config/env'
import { MeModule } from './modules/accounts/me.module'
import { AuthModule } from './modules/auth/auth.module'
import { EditionsModule } from './modules/editions/editions.module'
import { HealthModule } from './modules/health/health.module'
import { TenantsModule } from './modules/tenants/tenants.module'

@Module({})
export class AppModule implements NestModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        ORPCModule.forRoot({
          // Every error reaches HttpExceptionFilter, which renders the error format of PLAN.md 5.
          plugins: [new RethrowHandlerPlugin({ filter: () => true })],
          sendResponseInterceptors: [deferResponseInTenantTransaction],
        }),
        DatabaseModule,
        HealthModule,
        MeModule,
        AuthModule,
        TenantsModule,
        EditionsModule,
      ],
      providers: [
        { provide: ENV, useValue: env },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor },
        TenantContextService,
        AccessRepository,
      ],
      exports: [ENV, TenantContextService, AccessRepository],
    }
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL })
  }
}
