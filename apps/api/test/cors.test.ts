import { type NestExpressApplication } from '@nestjs/platform-express'
import { contract } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { uploadRoutes } from '../src/modules/files/upload-body'
import { createApp } from './app'

// An explicit list of origins, the four request headers, Retry-After exposed,
// credentials for the applications' origins only.

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
  it.each([env.PANEL_URL, env.PORTAL_URL, env.ADMIN_URL!])('allows %s by name', async (origin) => {
    const res = await preflight(origin).expect(204)

    expect(res.headers['access-control-allow-origin']).toBe(origin)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  // A browser asks before it sends a file: a route that takes one has a parser of its own before
  // the routes, which must leave the question to CORS.
  it.each(uploadRoutes(contract))(
    'answers the preflight of $method $path, a route that takes a file',
    async ({ method, path }) => {
      const res = await request(app.getHttpServer())
        .options(path.replace(/:\w+/g, '7a1e6b56-2c3f-4d55-9a2e-1f0b7c3d9e10'))
        .set('Origin', env.PANEL_URL)
        .set('Access-Control-Request-Method', method)
        .set('Access-Control-Request-Headers', 'content-type,x-tenant-slug')
        .expect(204)

      expect(res.headers['access-control-allow-origin']).toBe(env.PANEL_URL)
      expect(res.headers['access-control-allow-credentials']).toBe('true')
      expect(String(res.headers['access-control-allow-methods'])).toContain(method)
    },
  )

  it('finds a route that takes a file to ask about', () => {
    expect(uploadRoutes(contract).length).toBeGreaterThan(0)
  })

  // The fifth is the result token of an order, which travels in no path and no query.
  it('allows the five request headers and no other', async () => {
    const res = await preflight(env.PANEL_URL)

    const allowed = String(res.headers['access-control-allow-headers'])
      .split(',')
      .map((header) => header.trim().toLowerCase())
      .sort()
    expect(allowed).toEqual([
      'accept-language',
      'authorization',
      'content-type',
      'x-result-token',
      'x-tenant-slug',
    ])
  })

  it('names no origin for another one, on a preflight and on a request', async () => {
    const foreign = 'https://evil.example'

    const res = await preflight(foreign)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    expect(res.headers['access-control-allow-credentials']).toBeUndefined()

    const get = await request(app.getHttpServer()).get('/health').set('Origin', foreign)
    expect(get.headers['access-control-allow-origin']).toBeUndefined()
    expect(get.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('answers an allowed origin on an actual request with credentials', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('Origin', env.PORTAL_URL)

    expect(res.headers['access-control-allow-origin']).toBe(env.PORTAL_URL)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
    expect(res.headers.vary).toMatch(/origin/i)
  })

  it('varies on Origin for a request without one and for a foreign one, so no cache mixes them', async () => {
    const plain = await request(app.getHttpServer()).get('/health')
    const foreign = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example')

    expect(plain.headers.vary).toMatch(/origin/i)
    expect(foreign.headers.vary).toMatch(/origin/i)
  })

  it('varies on Origin for the refusals made before routing too', async () => {
    const notJson = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .set('Content-Type', 'text/plain')
      .send('x')
    const noOrigin = await request(app.getHttpServer())
      .post('/auth/sign-out')
      .set('Cookie', 'opos_portal_access=x')

    expect(notJson.status).toBe(415)
    expect(notJson.headers.vary).toMatch(/origin/i)
    expect(noOrigin.status).toBe(403)
    expect(noOrigin.headers.vary).toMatch(/origin/i)
  })

  it('exposes Retry-After and the name of a file, which a browser hides from a script otherwise', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('Origin', env.PANEL_URL)

    // And Content-Disposition, by which a file an org exports is saved under its own name.
    expect(res.headers['access-control-expose-headers']).toBe('Retry-After,Content-Disposition')
  })
})
