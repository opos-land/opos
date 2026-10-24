import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { authUserExists, deleteCreatedAccounts, mintToken } from './auth'
import {
  accountRows,
  addEdition,
  addEditionAccess,
  addHead,
  addOrg,
  closeTenantDb,
  countHeads,
  deleteCreatedTenants,
  member,
  tenantWithHead,
} from './tenants'

// The account lifecycle's end (PLAN.md 7.4, 9): DELETE /me through the Supabase Auth admin API.

let app: NestExpressApplication

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const deleteMe = (token: string) =>
  request(app.getHttpServer()).delete('/me').set('Authorization', `Bearer ${token}`)

const now = () => Math.floor(Date.now() / 1000)

describe('DELETE /me', () => {
  it('deletes the user, the account and its memberships', async () => {
    const { id: tenantId } = await tenantWithHead()
    const editionId = await addEdition(tenantId)
    const org = await member()
    const membershipId = await addOrg(tenantId, org, { settings: 'read' })
    await addEditionAccess(tenantId, membershipId, editionId, { program: 'write' })
    expect(await accountRows(org.id)).toEqual({
      accounts: 1,
      tenantMemberships: 1,
      editionMemberships: 1,
    })

    await deleteMe(org.token).expect(204)

    expect(await accountRows(org.id)).toEqual({
      accounts: 0,
      tenantMemberships: 0,
      editionMemberships: 0,
    })
    expect(await authUserExists(org.id)).toBe(false)
    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(401)
    expect(res.body).toMatchObject({ code: 'session.invalid' })
  })

  it.each([
    ['a sign-in older than 5 minutes', () => [{ method: 'password', timestamp: now() - 301 }]],
    ['no sign-in record', () => undefined],
  ])('asks to sign in again after %s', async (_, amr) => {
    const account = await member()
    const token = await mintToken({ sub: account.id, amr: amr() })

    const res = await deleteMe(token).expect(401)

    expect(res.body).toMatchObject({ code: 'session.reauthentication-required' })
    expect(await authUserExists(account.id)).toBe(true)
    expect((await accountRows(account.id)).accounts).toBe(1)
  })

  it('takes the newest sign-in of the token', async () => {
    const account = await member()
    const token = await mintToken({
      sub: account.id,
      amr: [
        { method: 'password', timestamp: now() - 3600 },
        { method: 'oauth', timestamp: now() - 10 },
      ],
    })

    await deleteMe(token).expect(204)

    expect(await authUserExists(account.id)).toBe(false)
  })

  it('refuses the last head of a tenant and keeps everything', async () => {
    const { id: tenantId, head } = await tenantWithHead()

    const res = await deleteMe(head.token).expect(409)

    expect(res.body).toMatchObject({ code: 'membership.last-head' })
    expect(await authUserExists(head.id)).toBe(true)
    expect(await accountRows(head.id)).toMatchObject({ accounts: 1, tenantMemberships: 1 })
    expect(await countHeads(tenantId)).toBe(1)
  })

  it('deletes a head the tenant has another one besides', async () => {
    const { id: tenantId, head } = await tenantWithHead()
    await addHead(tenantId, await member())

    await deleteMe(head.token).expect(204)

    expect(await authUserExists(head.id)).toBe(false)
    expect(await countHeads(tenantId)).toBe(1)
  })

  it('refuses a head who is the last one in any of its tenants', async () => {
    const shared = await tenantWithHead()
    await addHead(shared.id, await member())
    const own = await tenantWithHead()
    await addHead(shared.id, own.head)

    await deleteMe(own.head.token).expect(409)

    expect(await accountRows(own.head.id)).toMatchObject({ accounts: 1, tenantMemberships: 2 })
  })
})
