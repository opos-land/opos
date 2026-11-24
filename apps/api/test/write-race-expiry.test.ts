import { type NestExpressApplication } from '@nestjs/platform-express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import {
  addOrg,
  closeTenantDb,
  deleteCreatedTenants,
  expireIn,
  member,
  openTransaction,
  sleep,
  tenantState,
} from './tenants'
import {
  lockTenantWrites,
  memberChanges,
  noEdition,
  type Request,
  type Setup,
  untilBlocked,
  untilExpired,
  writeRaces,
  writes,
} from './write-races'
import { TENANT_WRITE_LOCK_TIMEOUT_MS } from '../src/common/permissions/tenant-write-lock'

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

type Sql = Awaited<ReturnType<typeof openTransaction>>['sql']

describe('a write while the access of its actor ends', () => {
  // Anti-escalation already refuses an expiring org most member changes, and a new pairing
  // code for a scanner that works longer than the org's own access, so this covers the routes
  // that check nothing but the permission.
  it.each(
    Object.entries(writes).filter(
      ([name]) => !name.includes('members') && name !== 'scanners.renewPairing',
    ),
  )('%s refuses once the access of its actor ends while it waits', async (_, build) => {
    // The same expiry with nothing holding the lock: the org is active when its write starts.
    const control = await races.setup()
    await expireIn(control.orgId, 2000)
    expect((await races.send(control, build(control))).status, 'without the wait').toBeLessThan(300)

    // The test helpers share one connection, which the open transaction keeps: everything
    // they read or write comes before it.
    const s = await races.setup()
    await expireIn(s.orgId, 400)
    const expected = await tenantState(s.t.id)
    const holder = await openTransaction()
    await lockTenantWrites(holder.sql, s.t)

    const pending = races.send(s, build(s))
    // Read before the commit and asserted after it, so a failure leaves no transaction open.
    const waited = await untilBlocked(holder.sql, pending)
    await untilExpired(holder.sql, s.orgId)
    await holder.commit()

    const res = await pending
    expect(waited, 'the request waits for the lock').toBe(true)
    expect(res.status).toBe(403)
    expect(await tenantState(s.t.id)).toEqual(expected)
  })

  /** `build` is refused, changing nothing, when the actor's access ends while `hold` is held. */
  async function refusedOnceAccessEnds(
    build: (s: Setup, ends: Date) => Request,
    hold: (sql: Sql, s: Setup) => Promise<unknown>,
  ) {
    // The same expiry with nothing held: the org is active when its write starts and ends.
    const control = await races.setup()
    const controlEnds = await expireIn(control.orgId, 3000)
    expect(
      (await races.send(control, build(control, controlEnds))).status,
      'without the wait',
    ).toBeLessThan(300)

    // The test helpers share one connection, which the open transaction keeps: everything they
    // read or write comes before it.
    const s = await races.setup()
    const ends = await expireIn(s.orgId, 600)
    const expected = await tenantState(s.t.id)
    const holder = await openTransaction()
    await hold(holder.sql, s)

    const pending = races.send(s, build(s, ends))
    // Read before the commit and asserted after it, so a failure leaves no transaction open.
    const waited = await untilBlocked(holder.sql, pending)
    await untilExpired(holder.sql, s.orgId)
    await holder.commit()

    const res = await pending
    expect(waited, 'the request waits for what is held').toBe(true)
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'permission.denied' })
    expect(await tenantState(s.t.id)).toEqual(expected)
  }

  const holdEdition = (sql: Sql, s: Setup) =>
    sql`select 1 from editions where id = ${s.edition} for update`

  // After the check under the write lock, a member change waits for rows and re-checks its actor
  // on the row it locked, so the access of an actor may end during that wait too.
  it.each(Object.entries(memberChanges))(
    '%s refuses once the access of its actor ends while it waits for the actor row',
    (_, build) =>
      refusedOnceAccessEnds(
        build,
        (sql, s) => sql`select 1 from tenant_memberships where id = ${s.orgId} for update`,
      ),
    15_000,
  )

  it(
    'editions.members.put refuses once the access of its actor ends while it waits for the edition',
    () => refusedOnceAccessEnds(memberChanges['editions.members.put']!, holdEdition),
    15_000,
  )

  // An invitation locks its actor first and the editions it names after.
  it(
    'tenants.members.invite refuses once the access of its actor ends while it waits for an edition',
    () =>
      refusedOnceAccessEnds(
        (s, ends) => ({
          method: 'post',
          path: '/tenants/current/members',
          body: {
            email: s.newcomer.email,
            expiresAt: ends.toISOString(),
            editions: [{ editionId: s.edition, ...noEdition }],
          },
        }),
        holdEdition,
      ),
    15_000,
  )
})

describe('a write and the locks it waits for', () => {
  // A write waits for the lock a bounded time, then answers 503 and leaves the tenant as it was,
  // so a lock held long never pins a pool connection for as long.
  it('answers 503 request.busy to a write that waits too long for the lock', async () => {
    const s = await races.setup()
    const expected = await tenantState(s.t.id)
    const holder = await openTransaction()
    await lockTenantWrites(holder.sql, s.t)
    const started = performance.now()
    try {
      const res = await races.send(s, writes['tenants.update']!(s))
      expect(res.status).toBe(503)
      expect(res.body).toMatchObject({ code: 'request.busy' })
      expect(res.headers['retry-after']).toBe('1')
      expect(performance.now() - started).toBeGreaterThanOrEqual(TENANT_WRITE_LOCK_TIMEOUT_MS)
      expect(performance.now() - started).toBeLessThan(TENANT_WRITE_LOCK_TIMEOUT_MS + 2000)
    } finally {
      await holder.commit()
    }
    expect(await tenantState(s.t.id)).toEqual(expected)
  }, 15_000)

  // The bound is for the tenant's write lock alone: a row lock the write meets after it keeps
  // the default and is waited for as long as it is held.
  it('waits past the lock timeout for a row lock once it holds the write lock', async () => {
    const s = await races.setup()
    const row = await openTransaction()
    let pending: ReturnType<typeof races.send> | undefined
    try {
      await row.sql`select 1 from tenants where id = ${s.t.id} for update`
      pending = races.send(s, writes['tenants.update']!(s))
      // Settled now so an early failure is no unhandled rejection; awaited below.
      pending.catch(() => {})
      await sleep(TENANT_WRITE_LOCK_TIMEOUT_MS + 1000)
    } finally {
      await row.commit()
    }

    expect((await pending).status).toBe(200)
  }, 15_000)

  // The lock is for writes the check lets through: an outsider or a member short of the need is
  // refused at once, so requests that will fail never queue on another tenant's lock.
  it('refuses an outsider and a reader without waiting for the write lock', async () => {
    const s = await races.setup()
    const [outsider, reader] = await Promise.all([member(), member()])
    await addOrg(s.t.id, reader, { settings: 'read' })
    const holder = await openTransaction()
    await lockTenantWrites(holder.sql, s.t)
    try {
      for (const who of [outsider, reader]) {
        const res = await Promise.race([
          races.call(who, 'patch', '/tenants/current', { name: 'Late' }, s.t.slug),
          sleep(1000).then(() => 'waited' as const),
        ])
        expect(res === 'waited' ? res : res.status).toBe(403)
      }
    } finally {
      await holder.commit()
    }
  })

  // A member change locks memberships first and the tenant or edition rows after. A write that
  // locked a membership after its own rows would deadlock against it; these lock like a member
  // change, from outside, and expect both sides to finish.
  it('lets a tenant write finish beside a member change that locked its actor', async () => {
    const s = await races.setup()
    const change = await openTransaction()
    await change.sql`select 1 from tenant_memberships where id = ${s.orgId} for update`

    const pending = races.send(s, writes['tenants.update']!(s))
    await sleep(300)
    const tenantLock = change.sql`select 1 from tenants where id = ${s.t.id} for no key update`
    const [res, lock] = await Promise.allSettled([pending, tenantLock])
    await change.rollback()

    expect(lock.status).toBe('fulfilled')
    expect(res.status === 'fulfilled' && res.value.status).toBe(200)
  })

  it('lets an edition delete finish beside a member change that locked its actor', async () => {
    const s = await races.setup()
    const change = await openTransaction()
    await change.sql`select 1 from tenant_memberships where id = ${s.orgId} for update`

    const pending = races.send(s, writes['editions.remove']!(s))
    await sleep(300)
    const rowsLock = change.sql`delete from edition_memberships where tenant_membership_id = ${s.orgId}`
    const [res, lock] = await Promise.allSettled([pending, rowsLock])
    await change.rollback()

    expect(lock.status).toBe('fulfilled')
    expect(res.status === 'fulfilled' && res.value.status).toBe(204)
  })
})
