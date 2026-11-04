import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { loadCatalogs } from '@opos/i18n'
import { APP_OPTIONS, configureApp } from './app'
import { AppModule } from './app.module'
import { DEFAULT_RATE_LIMIT } from './common/rate-limit/rate-limit'
import { loadEnv } from './config/env'

const env = loadEnv()
// A bundle that lost a catalog fails here, not on the first email it renders.
await loadCatalogs()
const app = await NestFactory.create<NestExpressApplication>(
  AppModule.register(env, {
    ...DEFAULT_RATE_LIMIT,
    limit: env.RATE_LIMIT_DEFAULT ?? DEFAULT_RATE_LIMIT.limit,
  }),
  APP_OPTIONS,
)
await configureApp(app, env)
await app.listen(env.PORT)
