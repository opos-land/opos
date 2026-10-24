import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'

describe('GET /health', () => {
  let app: NestExpressApplication

  beforeAll(async () => {
    app = await createApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200)
    expect(res.body).toEqual({ status: 'ok', database: 'up' })
  })
})

describe('GET /health without a database', () => {
  it('returns 503', async () => {
    const app = await createApp({ DATABASE_URL: 'postgres://opos_app:opos@127.0.0.1:1/postgres' })
    const res = await request(app.getHttpServer()).get('/health').expect(503)
    expect(res.body).toEqual({ status: 'unavailable', database: 'down' })
    await app.close()
  })
})
