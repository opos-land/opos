import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
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

  it('allows the panel origin and rejects others', async () => {
    const env = loadEnv()
    const allowed = await request(app.getHttpServer()).get('/health').set('Origin', env.PANEL_URL)
    expect(allowed.headers['access-control-allow-origin']).toBe(env.PANEL_URL)

    const foreign = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example')
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined()
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
