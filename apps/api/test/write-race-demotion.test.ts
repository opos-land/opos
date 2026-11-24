import { type NestExpressApplication } from '@nestjs/platform-express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import { tenantRequirements } from './route-needs'
import { closeTenantDb, deleteCreatedTenants, openTransaction, tenantState } from './tenants'
import { lockTenantWrites, untilBlocked, writeRaces, writes } from './write-races'

let app: NestExpressApplication
let races: ReturnType<typeof writeRaces>

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  races = writeRaces(app)
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

describe('a write while a demotion of its actor commits', () => {
  it('covers every write route of the contract', () => {
    const routes = Object.entries(tenantRequirements)
      .filter(([, need]) => 'resource' in need && need.level === 'write')
      .map(([name]) => name)
    expect(Object.keys(writes).sort()).toEqual(routes.sort())
  })

  it.each(Object.entries(writes))(
    '%s refuses once a demotion of its actor commits, and changes nothing',
    async (_, build) => {
      const control = await races.setup()
      expect(
        (await races.send(control, build(control))).status,
        'without the demotion',
      ).toBeLessThan(300)

      const s = await races.setup()
      const expected = await tenantState(s.t.id)
      expected.memberships = expected.memberships.map((row) =>
        row.id === s.orgId
          ? {
              ...row,
              settings_access: 'none',
              branding_access: 'none',
              shop_config_access: 'none',
            }
          : row,
      )
      expected.editionMemberships = expected.editionMemberships.map((row) =>
        row.tenant_membership_id === s.orgId
          ? { ...row, program_access: 'none', tickets_access: 'none' }
          : row,
      )
      const demotion = await openTransaction()
      await lockTenantWrites(demotion.sql, s.t)
      await demotion.sql`update tenant_memberships set settings_access = 'none', branding_access = 'none', shop_config_access = 'none' where id = ${s.orgId}`
      await demotion.sql`update edition_memberships set program_access = 'none', tickets_access = 'none' where tenant_membership_id = ${s.orgId}`

      const pending = races.send(s, build(s))
      // Read before the commit and asserted after it, so a failure leaves no transaction open.
      const waited = await untilBlocked(demotion.sql, pending)
      await demotion.commit()

      const res = await pending
      expect(waited, 'the request waits for the lock').toBe(true)
      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: 'permission.denied' })
      expect(await tenantState(s.t.id)).toEqual(expected)
    },
  )
})
