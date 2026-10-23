import 'reflect-metadata'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { configureApp } from '../src/app'
import { AppModule } from '../src/app.module'
import { loadEnv } from '../src/config/env'

/** The API as main.ts builds it, with the test environment and optional overrides. */
export async function createApp(overrides: Record<string, string> = {}) {
  const env = loadEnv({ ...process.env, ...overrides })
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(env)] }).compile()
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>(), env)
  await app.init()
  return app
}
