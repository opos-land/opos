import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { appDb, globalDb, migrationDb, RUNTIME_TIMEOUTS } from '../src/client'
import { migrationUrl } from '../src/migration-url'
import { setTenantContext } from '../src/rls'
import { appGlobalPassword, appPassword, createTenant, url } from './db'

// A runtime session takes its limits from its role, which db:roles writes from RUNTIME_TIMEOUTS,
// and sends only application_name; the migration pool sends no limit of its own (PLAN.md 4.6).

const pools = {
  opos_app: appDb(url('opos_app', appPassword), { max: 1 }),
  opos_app_global: globalDb(url('opos_app_global', appGlobalPassword), { max: 1 }),
  postgres: migrationDb(migrationUrl()),
}

afterAll(async () => {
  await Promise.all(Object.values(pools).map((db) => db.$client.end()))
})

const limits = Object.keys(RUNTIME_TIMEOUTS)

const settingsOf = async (role: keyof typeof pools) => {
  const [row] = await pools[role].execute<Record<keyof typeof RUNTIME_TIMEOUTS, string>>(sql`
    select current_setting('statement_timeout') as statement_timeout,
      current_setting('idle_in_transaction_session_timeout') as idle_in_transaction_session_timeout,
      current_setting('transaction_timeout') as transaction_timeout
  `)
  return row
}

/** Where a session's setting came from: `user` is its role, `client` a startup parameter. */
const sourceOf = async (role: keyof typeof pools, setting: string) => {
  const [row] = await pools[role].execute<{ source: string }>(
    sql`select source from pg_settings where name = ${setting}`,
  )
  return row?.source
}

describe('connection settings', () => {
  it.each(['opos_app', 'opos_app_global'] as const)(
    'bounds every session as %s from its role',
    async (role) => {
      expect(await settingsOf(role)).toEqual(RUNTIME_TIMEOUTS)
      for (const limit of limits) expect(await sourceOf(role, limit), limit).toBe('user')
    },
  )

  it.each([
    ['opos_app', 'opos-app'],
    ['opos_app_global', 'opos-app-global'],
  ] as const)('sends application_name as %s', async (role, name) => {
    const [row] = await pools[role].execute<{ name: string }>(
      sql`select current_setting('application_name') as name`,
    )

    expect(row).toEqual({ name })
    expect(await sourceOf(role, 'application_name')).toBe('client')
  })

  it.each([
    ['a cancelled statement', "set local statement_timeout = '100ms'", 0],
    ['an ended session', "set local idle_in_transaction_session_timeout = '100ms'", 300],
  ] as const)('reuses no tenant context after %s', async (_, bound, idleMs) => {
    const tenant = await createTenant()
    const db = appDb(url('opos_app', appPassword), { max: 1 })
    try {
      await expect(
        db.transaction(async (tx) => {
          await setTenantContext(tx, tenant.id)
          await tx.execute(sql.raw(bound))
          await new Promise((resolve) => setTimeout(resolve, idleMs))
          await tx.execute(sql`select pg_sleep(1)`)
        }),
      ).rejects.toThrow()
      const [row] = await db.execute<{ tenant_id: string | null }>(
        sql`select nullif(current_setting('app.tenant_id', true), '') as tenant_id`,
      )
      expect(row).toEqual({ tenant_id: null })
    } finally {
      await db.$client.end()
    }
  })

  it('sends no limit from the migration pool', async () => {
    for (const limit of limits) {
      expect(await sourceOf('postgres', limit), limit).not.toBe('client')
    }
  })
})
