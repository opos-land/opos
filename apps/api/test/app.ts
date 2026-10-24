import 'reflect-metadata'
import { type Type } from '@nestjs/common'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { configureApp } from '../src/app'
import { AppModule } from '../src/app.module'
import { loadEnv } from '../src/config/env'

/** The API as main.ts builds it, with the test environment, overrides and extra test modules. */
export async function createApp(overrides: Record<string, string> = {}, modules: Type[] = []) {
  const env = loadEnv({ ...process.env, ...overrides })
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env), ...modules],
  }).compile()
  const app = await configureApp(moduleRef.createNestApplication<NestExpressApplication>(), env)
  await app.init()
  return app
}
