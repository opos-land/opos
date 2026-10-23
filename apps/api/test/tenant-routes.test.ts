import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { contract } from '@opos/contract'
import { type AppRoute, type AppRouter, isAppRoute } from '@ts-rest/core'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AnyZodObject } from 'zod'
import { createApp } from './app'
import { createAccount, deleteCreatedAccounts, signIn } from './auth'

// Every contract route that takes X-Tenant-Slug must run through the tenant transaction. A
// @RequireTenant above a router-level @TsRestHandler is silently dropped (PLAN.md 7.3); this
// catches it: an unknown slug answers 404 from the interceptor, before any handler runs.

const tenantRoutes = (router: AppRouter, prefix = ''): [string, AppRoute][] =>
  Object.entries(router).flatMap(([key, value]): [string, AppRoute][] => {
    if (!isAppRoute(value)) return tenantRoutes(value, `${prefix}${key}.`)
    const shape = (value.headers as AnyZodObject | undefined)?.shape as
      Record<string, unknown> | undefined
    return shape?.['x-tenant-slug'] ? [[`${prefix}${key}`, value]] : []
  })

let app: NestExpressApplication
let token: string

beforeAll(async () => {
  app = await createApp()
  const account = await createAccount()
  token = await signIn(account.email)
})

afterAll(async () => {
  await deleteCreatedAccounts()
  await app.close()
})

describe('tenant routes', () => {
  const routes = tenantRoutes(contract)

  it('exist in the contract', () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  it.each(routes)('%s goes through the tenant transaction', async (_, route) => {
    const path = route.path.replace(/:[A-Za-z]+/g, randomUUID())
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
    const agent = request(app.getHttpServer())
    const res = await agent[method](path)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Slug', `missing-${randomUUID().slice(0, 8)}`)
      .send({})

    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ code: 'request.not-found', message: 'Unknown tenant' })
  })
})
