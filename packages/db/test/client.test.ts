import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { appDb, globalDb, migrationDb, RUNTIME_TIMEOUTS } from '../src/client'
import { setTenantContext } from '../src/rls'
import { createTenant, url } from './db'

// The runtime pools bound how long a statement, a transaction and an idle transaction may hold a
// connection; the migrator's pool stays unbounded for long migrations (PLAN.md 4.6).

const pools = {
  opos_app: appDb(url('opos_app', 'opos'), { max: 1 }),
  opos_app_global: globalDb(url('opos_app_global', 'opos'), { max: 1 }),
  opos_migrator: migrationDb(url('opos_migrator', 'opos')),
}

afterAll(async () => {
  await Promise.all(Object.values(pools).map((db) => db.$client.end()))
})

const settingsOf = async (role: keyof typeof pools) => {
  const [row] = await pools[role].execute<Record<keyof typeof RUNTIME_TIMEOUTS, string>>(sql`
    select current_setting('statement_timeout') as statement_timeout,
      current_setting('idle_in_transaction_session_timeout') as idle_in_transaction_session_timeout,
      current_setting('transaction_timeout') as transaction_timeout
  `)
  return row
}

describe('connection timeouts', () => {
  it.each(['opos_app', 'opos_app_global'] as const)('bounds every session as %s', async (role) => {
    expect(await settingsOf(role)).toEqual(RUNTIME_TIMEOUTS)
  })

  it.each([
    ['a cancelled statement', "set local statement_timeout = '100ms'", 0],
    ['an ended session', "set local idle_in_transaction_session_timeout = '100ms'", 300],
  ] as const)('reuses no tenant context after %s', async (_, bound, idleMs) => {
    const tenant = await createTenant()
    const db = appDb(url('opos_app', 'opos'), { max: 1 })
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

  it('leaves the migrator unbounded', async () => {
    expect(await settingsOf('opos_migrator')).toEqual({
      statement_timeout: '0',
      idle_in_transaction_session_timeout: '0',
      transaction_timeout: '0',
    })
  })
})
