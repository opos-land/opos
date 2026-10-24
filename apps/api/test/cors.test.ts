import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { createApp } from './app'

// PLAN.md 7.8: an explicit list of origins, the four request headers, no credentials.

const env = loadEnv()
let app: NestExpressApplication

beforeAll(async () => {
  app = await createApp()
})

afterAll(async () => {
  await app.close()
})

const preflight = (origin: string, headers = 'authorization,content-type') =>
  request(app.getHttpServer())
    .options('/me')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'PATCH')
    .set('Access-Control-Request-Headers', headers)

describe('CORS', () => {
  it.each([env.PANEL_URL, env.PORTAL_URL])('allows %s by name', async (origin) => {
    const res = await preflight(origin).expect(204)

    expect(res.headers['access-control-allow-origin']).toBe(origin)
    expect(res.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('allows the four request headers and no other', async () => {
    const res = await preflight(env.PANEL_URL)

    const allowed = String(res.headers['access-control-allow-headers'])
      .split(',')
      .map((header) => header.trim().toLowerCase())
      .sort()
    expect(allowed).toEqual(['accept-language', 'authorization', 'content-type', 'x-tenant-slug'])
  })

  it('names no origin for another one, on a preflight and on a request', async () => {
    const foreign = 'https://evil.example'

    const res = await preflight(foreign)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()

    const get = await request(app.getHttpServer()).get('/health').set('Origin', foreign)
    expect(get.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('answers an allowed origin on an actual request without credentials', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('Origin', env.PORTAL_URL)

    expect(res.headers['access-control-allow-origin']).toBe(env.PORTAL_URL)
    expect(res.headers['access-control-allow-credentials']).toBeUndefined()
    expect(res.headers.vary).toMatch(/origin/i)
  })
})
