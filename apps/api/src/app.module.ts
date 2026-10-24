import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerGuard } from '@nestjs/throttler'
import { ORPCModule } from '@orpc/nest'
import { experimental_RethrowHandlerPlugin as RethrowHandlerPlugin } from '@orpc/server/plugins'
import { deferResponseInTenantTransaction } from './common/als/defer-response'
import { TenantContextMiddleware } from './common/als/tenant-context.middleware'
import { TenantContextService } from './common/als/tenant-context.service'
import { TenantTransactionInterceptor } from './common/als/tenant-transaction.interceptor'
import { DatabaseModule } from './common/database/database.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { AccessRepository } from './common/permissions/access.repository'
import { DEFAULT_RATE_LIMIT, type RateLimit, rateLimitModule } from './common/rate-limit/rate-limit'
import { ENV, type Env } from './config/env'
import { MeModule } from './modules/accounts/me.module'
import { AuthModule } from './modules/auth/auth.module'
import { EditionsModule } from './modules/editions/editions.module'
import { HealthModule } from './modules/health/health.module'
import { TenantsModule } from './modules/tenants/tenants.module'

@Module({})
export class AppModule implements NestModule {
  /** `rateLimit` replaces the default limit of PLAN.md 7.9, for tests that run into it. */
  static register(env: Env, rateLimit: RateLimit = DEFAULT_RATE_LIMIT): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        ORPCModule.forRoot({
          // Every error reaches HttpExceptionFilter, which renders the error format of PLAN.md 5.
          plugins: [new RethrowHandlerPlugin({ filter: () => true })],
          sendResponseInterceptors: [deferResponseInTenantTransaction],
        }),
        rateLimitModule(env, rateLimit),
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
        // A global guard runs before every route's own guards, JwtAuthGuard included.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
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
