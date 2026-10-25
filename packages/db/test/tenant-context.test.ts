import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, describe, expect, it } from 'vitest'
import { appDb, globalDb, migrationDb } from '../src/client'
import { setTenantContext } from '../src/rls'
import * as schema from '../src/schema'
import { createTenant, supabaseAdmin, url } from './db'

// setTenantContext opens tenant isolation only on a connection RLS holds to (PLAN.md 4.6): a pool
// pointed at a role that bypasses RLS fails every tenant transaction instead of reading them all.

class Rollback extends Error {}

const pools = {
  opos_app: appDb(url('opos_app', 'opos'), { max: 1 }),
  opos_app_global: globalDb(url('opos_app_global', 'opos'), { max: 1 }),
  opos_migrator: migrationDb(url('opos_migrator', 'opos')),
}

afterAll(async () => {
  await Promise.all(Object.values(pools).map((db) => db.$client.end()))
})

describe('setTenantContext', () => {
  it('opens the tenant context as opos_app', async () => {
    const tenant = await createTenant()
    await expect(
      pools.opos_app.transaction((tx) => setTenantContext(tx, tenant.id)),
    ).resolves.not.toThrow()
  })

  it.each(['opos_app_global', 'opos_migrator'] as const)(
    'refuses a tenant context on a connection as %s',
    async (role) => {
      const tenant = await createTenant()
      await expect(
        pools[role].transaction((tx) => setTenantContext(tx, tenant.id)),
      ).rejects.toThrow(new RegExp(`runs as ${role}`))
    },
  )

  // The attribute is changed and the role taken inside one transaction that rolls back, so no
  // other session, the API tests running beside these included, ever sees opos_app bypass RLS.
  it('refuses a tenant context on opos_app once it bypasses RLS', async () => {
    const tenant = await createTenant()
    const admin = drizzle({ client: supabaseAdmin, schema, casing: 'snake_case' })
    let refusal: unknown
    await admin
      .transaction(async (tx) => {
        await tx.execute(sql`alter role opos_app bypassrls`)
        await tx.execute(sql`set local role opos_app`)
        refusal = await setTenantContext(tx, tenant.id).catch((error: unknown) => error)
        throw new Rollback()
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error
      })
    expect(String(refusal)).toMatch(/runs as opos_app, which bypasses RLS/)
  })

  it('refuses a tenant context on opos_app once it is a member of another role', async () => {
    const tenant = await createTenant()
    const admin = drizzle({ client: supabaseAdmin, schema, casing: 'snake_case' })
    let refusal: unknown
    await admin
      .transaction(async (tx) => {
        await tx.execute(sql`grant opos_migrator to opos_app`)
        await tx.execute(sql`set local role opos_app`)
        refusal = await setTenantContext(tx, tenant.id).catch((error: unknown) => error)
        throw new Rollback()
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error
      })
    expect(String(refusal)).toMatch(/runs as opos_app, a member of other roles/)
  })
})
