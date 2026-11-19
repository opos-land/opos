import 'reflect-metadata'
import { type Type } from '@nestjs/common'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { APP_OPTIONS, configureApp } from '../src/app'
import { AppModule } from '../src/app.module'
import { type RateLimit } from '../src/common/rate-limit/rate-limit'
import { loadEnv } from '../src/config/env'
import { type FileKind } from '../src/modules/files/kinds'

/**
 * The API as main.ts builds it, with the test environment, overrides, extra test modules and,
 * for the rate limit tests, a limit of their own, and for the storage's, kinds of file of their own.
 */
export async function createApp(
  overrides: Record<string, string> = {},
  modules: Type[] = [],
  rateLimit?: RateLimit,
  fileKinds?: readonly FileKind[],
) {
  const env = loadEnv({ ...process.env, ...overrides })
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env, rateLimit, fileKinds), ...modules],
  }).compile()
  const app = await configureApp(
    moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS),
    env,
  )
  await app.init()
  return app
}
