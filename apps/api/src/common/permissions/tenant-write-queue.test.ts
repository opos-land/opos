import { describe, expect, it } from 'vitest'
import { ApiError } from '../errors/api-error'
import { TenantWriteQueue } from './tenant-write-queue'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A write that records when it starts and ends and takes `ms`. */
const write = (log: string[], name: string, ms: number) => async () => {
  log.push(`${name} start`)
  await sleep(ms)
  log.push(`${name} end`)
  return name
}

describe('TenantWriteQueue', () => {
  it('runs the writes of one tenant one after another, in arrival order', async () => {
    const queue = new TenantWriteQueue(1000)
    const log: string[] = []

    const results = await Promise.all([
      queue.run('a', write(log, 'first', 30)),
      queue.run('a', write(log, 'second', 10)),
      queue.run('a', write(log, 'third', 10)),
    ])

    expect(results).toEqual(['first', 'second', 'third'])
    expect(log).toEqual([
      'first start',
      'first end',
      'second start',
      'second end',
      'third start',
      'third end',
    ])
  })

  it('runs the writes of different tenants at once', async () => {
    const queue = new TenantWriteQueue(1000)
    const log: string[] = []

    await Promise.all([queue.run('a', write(log, 'a', 30)), queue.run('b', write(log, 'b', 10))])

    expect(log).toEqual(['a start', 'b start', 'b end', 'a end'])
  })

  it('refuses with 503 request.busy a write that waits longer than its bound', async () => {
    const queue = new TenantWriteQueue(50)
    const log: string[] = []

    const holder = queue.run('a', write(log, 'holder', 150))
    const waiter = queue.run('a', write(log, 'waiter', 10))

    const refusal = await waiter.catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(ApiError)
    expect(refusal).toMatchObject({ code: 'request.busy', headers: { 'Retry-After': '1' } })
    expect((refusal as ApiError).getStatus()).toBe(503)
    await holder
    expect(log).toEqual(['holder start', 'holder end'])
  })

  it('keeps the order for the writes behind one that gave up', async () => {
    const queue = new TenantWriteQueue(80)
    const log: string[] = []

    const holder = queue.run('a', write(log, 'holder', 120))
    const gaveUp = queue.run('a', write(log, 'gave up', 10)).catch(() => 'refused')
    await sleep(60)
    const later = queue.run('a', write(log, 'later', 10))

    expect(await gaveUp).toBe('refused')
    expect(await later).toBe('later')
    await holder
    expect(log).toEqual(['holder start', 'holder end', 'later start', 'later end'])
  })

  it('frees the tenant once its writes are done, also after a write that threw', async () => {
    const queue = new TenantWriteQueue(1000)
    await queue
      .run('a', () => Promise.reject(new Error('handler failed')))
      .catch((error: unknown) => error)

    const started = Date.now()
    await queue.run('a', async () => {})
    expect(Date.now() - started).toBeLessThan(20)
  })

  it('lets the next write start as soon as the running one gives its turn back', async () => {
    const queue = new TenantWriteQueue(1000)
    const log: string[] = []

    await Promise.all([
      queue.run('a', async (release) => {
        log.push('first commits')
        release()
        await sleep(40)
        log.push('first answers')
      }),
      queue.run('a', write(log, 'second', 10)),
    ])

    expect(log).toEqual(['first commits', 'second start', 'second end', 'first answers'])
  })

  it('takes the turn back from a write that never settles after its longest turn', async () => {
    const queue = new TenantWriteQueue(500, 60)
    const log: string[] = []

    void queue.run('a', () => new Promise<never>(() => {}))
    const started = Date.now()
    await queue.run('a', write(log, 'next', 10))

    expect(log).toEqual(['next start', 'next end'])
    expect(Date.now() - started).toBeGreaterThanOrEqual(50)
  })
})
