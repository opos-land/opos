import { randomUUID } from 'node:crypto'
import { migrationDb } from '@opos/db'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { type TenantContextService } from '../src/common/als/tenant-context.service'
import { AccessRepository } from '../src/common/permissions/access.repository'

// The bound on the wait for a tenant's write lock (PLAN.md 7.3) is set for that wait alone.

const url = process.env.DATABASE_MIGRATION_URL
if (!url) throw new Error('DATABASE_MIGRATION_URL is missing from apps/api/.env.example')
const db = migrationDb(url)

afterAll(() => db.$client.end())

describe('lockTenantWrites', () => {
  it('gives the transaction back the lock_timeout it had before', async () => {
    const shown = await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '2s'`)
      const context = {
        tx: () => tx,
        tenant: () => ({ id: randomUUID() }),
      } as unknown as TenantContextService
      await new AccessRepository(context).lockTenantWrites()
      const [row] = await tx.execute<{ lock_timeout: string }>(sql`show lock_timeout`)
      return row?.lock_timeout
    })
    expect(shown).toBe('2s')
  })
})
