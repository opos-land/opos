import { type OpenAPIObject } from '@nestjs/swagger'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'

describe('API docs', () => {
  it.each(['test', 'production'] as const)('serves the OpenAPI document in %s', async (nodeEnv) => {
    const app = await createApp({ NODE_ENV: nodeEnv })
    const res = await request(app.getHttpServer()).get('/docs/json').expect(200)
    const doc = res.body as OpenAPIObject
    expect(doc.openapi).toMatch(/^3\./)
    expect(doc.paths['/health']?.get?.operationId).toBe('health.check')
    await request(app.getHttpServer()).get('/docs').expect(200)
    await app.close()
  })
})
