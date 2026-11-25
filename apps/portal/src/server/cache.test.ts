// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createCache } from './cache'

const TIMES = { fresh: 60_000, stale: 600_000, retry: 5_000, max: 3 }

function setup() {
  let time = 0
  const cached = createCache<string>(TIMES, () => time)
  return {
    cached,
    pass: (ms: number) => {
      time += ms
    },
  }
}

describe('createCache', () => {
  it('reads once while the answer is fresh', async () => {
    const { cached, pass } = setup()
    const load = vi.fn().mockResolvedValue('a')

    await cached('key', load)
    pass(59_999)

    expect(await cached('key', load)).toBe('a')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reads again once the answer is no longer fresh', async () => {
    const { cached, pass } = setup()
    const load = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b')

    await cached('key', load)
    pass(60_000)

    expect(await cached('key', load)).toBe('b')
  })

  it('keeps the answers of different keys apart', async () => {
    const { cached } = setup()

    await cached('one', () => Promise.resolve('a'))

    expect(await cached('two', () => Promise.resolve('b'))).toBe('b')
  })

  it('reads once for the requests that arrive together', async () => {
    const { cached } = setup()
    const load = vi.fn().mockResolvedValue('a')

    const answers = await Promise.all([cached('key', load), cached('key', load)])

    expect(answers).toEqual(['a', 'a'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('answers with what it had when a later read fails', async () => {
    const { cached, pass } = setup()

    await cached('key', () => Promise.resolve('a'))
    pass(60_000)

    expect(await cached('key', () => Promise.reject(new Error('down')))).toBe('a')
  })

  it('fails when a read fails and nothing was had, or what was had is too old', async () => {
    const { cached, pass } = setup()

    await expect(cached('new', () => Promise.reject(new Error('down')))).rejects.toThrow('down')

    await cached('old', () => Promise.resolve('a'))
    pass(600_000)
    await expect(cached('old', () => Promise.reject(new Error('down')))).rejects.toThrow('down')
  })

  it('does not read again right after a failure, and does once a moment passed', async () => {
    const { cached, pass } = setup()
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue('a')

    await expect(cached('key', load)).rejects.toThrow('down')
    pass(4_999)
    await expect(cached('key', load)).rejects.toThrow()
    expect(load).toHaveBeenCalledTimes(1)

    pass(1)
    expect(await cached('key', load)).toBe('a')
  })

  it('forgets the oldest answer beyond its size', async () => {
    const { cached } = setup()
    const first = vi.fn().mockResolvedValue('a')

    await cached('1', first)
    await cached('2', () => Promise.resolve('b'))
    await cached('3', () => Promise.resolve('c'))
    await cached('4', () => Promise.resolve('d'))
    await cached('1', first)

    expect(first).toHaveBeenCalledTimes(2)
  })
})
