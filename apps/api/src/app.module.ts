import {
  type DynamicModule,
  Inject,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type OnModuleDestroy,
  type OnModuleInit,
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
import { TenantWriteQueue } from './common/permissions/tenant-write-queue'
import { DatabaseModule } from './common/database/database.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifier,
  createAccessTokenVerifier,
} from './common/guards/access-token'
import { AccessRepository } from './common/permissions/access.repository'
import { DEFAULT_RATE_LIMIT, type RateLimit, rateLimitModule } from './common/rate-limit/rate-limit'
import { RouteRateLimiter } from './common/rate-limit/route-rate-limit'
import { ENV, type Env } from './config/env'
import { MeModule } from './modules/accounts/me.module'
import { AuthModule } from './modules/auth/auth.module'
import { EditionsModule } from './modules/editions/editions.module'
import { EngagementModule } from './modules/engagement/engagement.module'
import { HealthModule } from './modules/health/health.module'
import { ProgramModule } from './modules/program/program.module'
import { PublicModule } from './modules/public/public.module'
import { TenantsModule } from './modules/tenants/tenants.module'

@Module({})
export class AppModule implements NestModule, OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier) {}

  /** `rateLimit` replaces the default limit, for tests that run into it. */
  static register(env: Env, rateLimit: RateLimit = DEFAULT_RATE_LIMIT): DynamicModule {
    // One per process, built here: the rate limit's options take it before Nest injects anything.
    const verifier = createAccessTokenVerifier(env)
    return {
      module: AppModule,
      global: true,
      imports: [
        ORPCModule.forRoot({
          // Every error reaches HttpExceptionFilter, which renders the API's error format.
          plugins: [new RethrowHandlerPlugin({ filter: () => true })],
          sendResponseInterceptors: [deferResponseInTenantTransaction],
        }),
        rateLimitModule(verifier, rateLimit, env),
        DatabaseModule,
        HealthModule,
        MeModule,
        AuthModule,
        TenantsModule,
        EditionsModule,
        ProgramModule,
        PublicModule,
        EngagementModule,
      ],
      providers: [
        { provide: ENV, useValue: env },
        { provide: ACCESS_TOKEN_VERIFIER, useValue: verifier },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        // A global guard runs before every route's own guards, JwtAuthGuard included.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor },
        TenantContextService,
        AccessRepository,
        // One queue per process, built here: its bound is a plain number Nest cannot inject.
        { provide: TenantWriteQueue, useFactory: () => new TenantWriteQueue() },
        RouteRateLimiter,
      ],
      exports: [
        ENV,
        ACCESS_TOKEN_VERIFIER,
        TenantContextService,
        AccessRepository,
        RouteRateLimiter,
      ],
    }
  }

  onModuleInit() {
    return this.verifier.loadKeys()
  }

  onModuleDestroy() {
    this.verifier.close()
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL })
  }
}
