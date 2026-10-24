import { type NestExpressApplication } from '@nestjs/platform-express'
import { contract, type Contract } from '@opos/contract'
import { createORPCClient, ORPCError } from '@orpc/client'
import { type ContractRouterClient } from '@orpc/contract'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import { closeTenantDb, deleteCreatedTenants, tenantWithHead } from './tenants'

// How a frontend talks to the API: a client typed by the contract, the session and the tenant in
// the headers of every request, and the API's error format read back as an ORPCError.

let app: NestExpressApplication
let t: Awaited<ReturnType<typeof tenantWithHead>>

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  t = await tenantWithHead()
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const client = (headers: Record<string, string>) => {
  const { port } = app.getHttpServer().address() as { port: number }
  const link = new OpenAPILink(contract, {
    url: `http://127.0.0.1:${port}`,
    headers,
    // { code, params, message } (PLAN.md 5) becomes ORPCError(code) with the params as its data.
    customErrorResponseBodyDecoder: (body, response) => {
      const error = body as { code: string; message: string; params?: object }
      return new ORPCError(error.code, {
        status: response.status,
        message: error.message,
        data: error.params,
      })
    },
  })
  return createORPCClient<ContractRouterClient<Contract>>(link)
}

describe('the contract client', () => {
  it('calls a tenant route with the types of the contract', async () => {
    const api = client({ authorization: `Bearer ${t.head.token}`, 'x-tenant-slug': t.slug })

    expect(await api.tenants.current()).toMatchObject({ id: t.id, slug: t.slug })
  })

  it('reads the error code and its params', async () => {
    const api = client({ authorization: `Bearer ${t.head.token}`, 'x-tenant-slug': t.slug })
    const own = (await api.tenants.members.list()).find((m) => m.role === 'head')!

    await expect(
      api.tenants.members.update({ params: { membershipId: own.id }, body: {} }),
    ).rejects.toMatchObject({ code: 'member.self', status: 403 })
    await expect(api.me.update({ body: { locale: 'cs' as 'pl' } })).rejects.toMatchObject({
      code: 'request.invalid',
      status: 400,
      data: { field: 'locale' },
    })
  })
})
