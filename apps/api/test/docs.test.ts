import 'reflect-metadata'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { type OpenAPIObject } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { configureApp } from '../src/app'
import { AppModule } from '../src/app.module'
import { loadEnv } from '../src/config/env'

async function createApp(nodeEnv: 'test' | 'production') {
  const env = loadEnv({ ...process.env, NODE_ENV: nodeEnv })
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(env)] }).compile()
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>(), env)
  await app.init()
  return app
}

describe('API docs', () => {
  it.each(['test', 'production'] as const)('serves the OpenAPI document in %s', async (nodeEnv) => {
    const app = await createApp(nodeEnv)
    const res = await request(app.getHttpServer()).get('/docs/json').expect(200)
    const doc = res.body as OpenAPIObject
    expect(doc.openapi).toMatch(/^3\./)
    expect(doc.paths['/health']?.get?.operationId).toBe('health.check')
    await request(app.getHttpServer()).get('/docs').expect(200)
    await app.close()
  })
})
