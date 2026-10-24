import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { contract, type ContractMeta } from '@opos/contract'
import {
  type AnyContractProcedure,
  type AnyContractRouter,
  isContractProcedure,
} from '@orpc/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { createAccount, deleteCreatedAccounts, signIn } from './auth'

// Every contract route marked as a tenant route must run through the tenant transaction: a method
// that implements one without @RequireTenant or @RequireEdition would skip it (PLAN.md 7.3). This
// catches it: an unknown slug answers 404 from the interceptor, before any handler runs.

const tenantRoutes = (router: AnyContractRouter, prefix = ''): [string, AnyContractProcedure][] =>
  Object.entries(router).flatMap(([key, value]: [string, AnyContractRouter]) => {
    if (!isContractProcedure(value)) return tenantRoutes(value, `${prefix}${key}.`)
    const meta = value['~orpc'].meta as ContractMeta
    return meta.tenant ? [[`${prefix}${key}`, value] as [string, AnyContractProcedure]] : []
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

  it.each(routes)('%s goes through the tenant transaction', async (_, procedure) => {
    const { method = 'GET', path = '/' } = procedure['~orpc'].route
    const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
    const agent = request(app.getHttpServer())
    const res = await agent[verb](path.replace(/\{[^}]+\}/g, randomUUID()))
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Slug', `missing-${randomUUID().slice(0, 8)}`)
      .send({})

    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ code: 'request.not-found', message: 'Unknown tenant' })
  })
})
