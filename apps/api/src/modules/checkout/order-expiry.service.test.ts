import { Logger } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type TenantContextService } from '../../common/als/tenant-context.service'
import { type GlobalDbService } from '../../common/database/global-db.service'
import { type CredentialsVault, type PaymentProviders } from '../payments/payment-providers'
import { OrderExpiry } from './order-expiry.service'
import { type OrdersRepository } from './orders.repository'
import { type PaymentConfirmations } from './payment-confirmations.service'
import { type PaymentsRepository } from './payments.repository'

// Asking a provider once more about the attempts of expired orders runs beside the expiry, never
// in its way: on a clock of its own, and sparing a provider that does not answer. What a run makes
// of one attempt is in test/order-expiry.test.ts, against the database.

const MINUTE = 60_000

/**
 * The job with what it reads and asks stood in for. A tenant is named after what asking about its
 * attempts meets: `answers` has a provider that says nobody paid, `down` one out of reach, and
 * `sealed` credentials that no longer open.
 */
function job(due: { id: string; tenantId: string }[] = []) {
  const holdEndsAt = new Date('2027-05-01T10:00:00Z')
  const marked: string[] = []
  const state = vi.fn((_provider: string, credentials: { tenant: string }) =>
    Promise.resolve(
      credentials.tenant === 'down'
        ? { state: 'unavailable', reason: 'stood in for' }
        : { state: 'not-paid' },
    ),
  )
  const open = vi.fn(({ tenantId }: { tenantId: string }) => {
    if (tenantId === 'sealed') throw new Error('The credentials do not open')
    return { tenant: tenantId }
  })
  const expiry = new OrderExpiry(
    {
      ordersPastHold: () => Promise.resolve([]),
      attemptsToAskAgain: () => Promise.resolve(due.map((row) => ({ ...row, holdEndsAt }))),
    } as unknown as GlobalDbService,
    {
      attempt: (id: string) =>
        Promise.resolve({
          id,
          orderId: `order-of-${id}`,
          provider: 'fake',
          amountMinor: 10000,
          confirmedAt: null,
          recheckedAt: null,
        }),
      order: () => Promise.resolve({ status: 'expired', currency: 'PLN', number: 'ABCDEFGHJK' }),
      providerAccount: () => Promise.resolve({ provider: 'fake', credentials: 'sealed' }),
      changeAttempt: (id: string) => {
        marked.push(id)
        return Promise.resolve()
      },
    } as unknown as PaymentsRepository,
    {} as OrdersRepository,
    {} as PaymentConfirmations,
    { state } as unknown as PaymentProviders,
    { open } as unknown as CredentialsVault,
    {
      withTenant: (_tenantId: string, work: () => unknown) => work(),
    } as unknown as TenantContextService,
  )
  /** The tenants whose provider was asked, in the order of the questions. */
  const asked = () => state.mock.calls.map(([, credentials]) => credentials.tenant)
  return { expiry, state, open, marked, asked }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('the clocks of the expiry and of asking again', () => {
  /** The job as a process outside the tests starts it, with both of its runs stood in for. */
  function started() {
    vi.useFakeTimers()
    vi.stubEnv('NODE_ENV', 'production')
    const { expiry } = job()
    const run = vi.spyOn(expiry, 'run').mockResolvedValue({ expired: 0, paid: 0, waiting: 0 })
    const recheck = vi
      .spyOn(expiry, 'recheck')
      .mockResolvedValue({ taken: 0, unpaid: 0, waiting: 0 })
    return { expiry, run, recheck }
  }

  it('expires every minute, and asks again every quarter of an hour', async () => {
    const { expiry, run, recheck } = started()
    expiry.onApplicationBootstrap()

    await vi.advanceTimersByTimeAsync(14 * MINUTE)
    expect(run).toHaveBeenCalledTimes(14)
    expect(recheck).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(recheck).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(run).toHaveBeenCalledTimes(45)
    expect(recheck).toHaveBeenCalledTimes(3)

    expiry.onApplicationShutdown()
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(run).toHaveBeenCalledTimes(45)
    expect(recheck).toHaveBeenCalledTimes(3)
  })

  // A provider slow to answer, or one that never does, holds no expiry back: orders of every
  // convention go on expiring while a run that asks again has not ended.
  it('goes on expiring while a run that asks again has not ended', async () => {
    const { expiry, run, recheck } = started()
    recheck.mockReturnValue(new Promise(() => {}))
    expiry.onApplicationBootstrap()

    await vi.advanceTimersByTimeAsync(60 * MINUTE)

    expect(run).toHaveBeenCalledTimes(60)
    // Its own next run waits for the one before.
    expect(recheck).toHaveBeenCalledTimes(1)
  })

  it('starts the next run of each after one that failed', async () => {
    const { expiry, run, recheck } = started()
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    run.mockRejectedValue(new Error('The database is away'))
    recheck.mockRejectedValue(new Error('The database is away'))
    expiry.onApplicationBootstrap()

    await vi.advanceTimersByTimeAsync(30 * MINUTE)

    expect(run).toHaveBeenCalledTimes(30)
    expect(recheck).toHaveBeenCalledTimes(2)
  })
})

describe('one run of asking again', () => {
  // A provider out of reach for one attempt of a convention is out of reach for its others: they
  // wait for the next run unasked, and the attempts of other conventions are asked about.
  it('asks a provider that did not answer about no other attempt of its convention', async () => {
    const { expiry, marked, asked } = job([
      { id: 'a1', tenantId: 'down' },
      { id: 'b1', tenantId: 'answers' },
      { id: 'a2', tenantId: 'down' },
      { id: 'a3', tenantId: 'down' },
      { id: 'b2', tenantId: 'answers' },
    ])

    expect(await expiry.recheck()).toEqual({ taken: 0, unpaid: 2, waiting: 3 })

    expect(asked()).toEqual(['down', 'answers', 'answers'])
    expect(marked).toEqual(['b1', 'b2'])
  })

  it('tries credentials that do not open once a convention', async () => {
    const { expiry, open, marked, asked } = job([
      { id: 's1', tenantId: 'sealed' },
      { id: 's2', tenantId: 'sealed' },
      { id: 'b1', tenantId: 'answers' },
    ])

    expect(await expiry.recheck()).toEqual({ taken: 0, unpaid: 1, waiting: 2 })

    expect(open.mock.calls.filter(([account]) => account.tenantId === 'sealed')).toHaveLength(1)
    expect(asked()).toEqual(['answers'])
    expect(marked).toEqual(['b1'])
  })

  // The providers are asked from one address for every convention: a run asks so many questions
  // and leaves the rest of the attempts to the next one, unread.
  it('asks no more questions than a run may, answered or not', async () => {
    const due = [
      { id: 'a1', tenantId: 'down' },
      { id: 'b1', tenantId: 'answers' },
      { id: 'b2', tenantId: 'answers' },
      { id: 'b3', tenantId: 'answers' },
    ]
    const { expiry, marked, asked } = job(due)

    expect(await expiry.recheck(new Date(), { questions: 3 })).toEqual({
      taken: 0,
      unpaid: 2,
      waiting: 1,
    })

    expect(asked()).toEqual(['down', 'answers', 'answers'])
    expect(marked).toEqual(['b1', 'b2'])
  })
})
