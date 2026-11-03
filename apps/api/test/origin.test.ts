import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { createApp } from './app'

// PLAN.md 7.4, requests that change state: a session cookie needs the Origin of an application.

const env = loadEnv()
const cookie = 'opos_portal_access=anything'
let app: NestExpressApplication

beforeAll(async () => {
  app = await createApp()
})

afterAll(async () => {
  await app.close()
})

const patch = (headers: Record<string, string>) =>
  request(app.getHttpServer()).patch('/me').set(headers).send({})

describe('Origin of a request that changes state', () => {
  it.each([
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['a sibling subdomain of the site', { origin: env.API_URL }],
    ['no Origin', {}],
  ])('answers 403 request.origin-denied with a session cookie and %s', async (_, headers) => {
    const res = await patch({ cookie, ...headers })

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'request.origin-denied' })
  })

  it.each([env.PORTAL_URL, env.PANEL_URL])(
    'lets %s through to the session check',
    async (origin) => {
      const res = await patch({ cookie, origin })

      expect(res.status).toBe(401)
      expect(res.body).toMatchObject({ code: 'session.invalid' })
    },
  )

  it('looks at a request with a session cookie only', async () => {
    const res = await patch({ origin: 'https://evil.example' })

    expect(res.status).toBe(401)
  })

  it('answers a form-encoded body with 415 before it looks at the Origin', async () => {
    const res = await request(app.getHttpServer())
      .patch('/me')
      .set({ cookie, origin: env.PORTAL_URL })
      .type('form')
      .send('a=b')

    expect(res.status).toBe(415)
  })
})
