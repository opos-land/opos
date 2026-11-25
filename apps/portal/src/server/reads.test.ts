// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { publicReads } from './reads'

const API = 'http://api.internal:3001'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const convention = {
  name: 'Convention A',
  defaultLocale: 'pl',
  timezone: 'Europe/Warsaw',
  logo: null,
}

/** The reads over a fetch that answers every request alike, and the requests it took. */
function setup(answer: () => Response | Promise<Response>) {
  const asked: string[] = []
  const send = vi.fn((request: Request) => {
    asked.push(`${request.method} ${request.url}`)
    return Promise.resolve(answer())
  })
  return { reads: publicReads({ apiUrl: API, fetch: send }), asked, send }
}

describe('publicReads', () => {
  it("reads a convention at the API's public address of it", async () => {
    const { reads, asked } = setup(() => json(200, convention))

    expect(await reads.convention('con-a')).toEqual(convention)
    expect(asked).toEqual([`GET ${API}/public/tenants/con-a`])
  })

  it('reads an edition, a programme item and a profile at theirs', async () => {
    const { reads, asked } = setup(() => json(200, {}))

    await reads.edition('con-a', '2027')
    await reads.programItem('con-a', '2027', 'item-1')
    await reads.profile('profile-1')

    expect(asked).toEqual([
      `GET ${API}/public/tenants/con-a/editions/2027`,
      `GET ${API}/public/tenants/con-a/editions/2027/program-items/item-1`,
      `GET ${API}/public/profiles/profile-1`,
    ])
  })

  it('keeps what an address holds inside its part of the path', async () => {
    const { reads, asked } = setup(() => json(200, convention))

    await reads.convention('a/../b c')

    expect(asked).toEqual([`GET ${API}/public/tenants/a%2F..%2Fb%20c`])
  })

  it('answers null for what the API does not find', async () => {
    const { reads } = setup(() => json(404, { code: 'request.not-found', message: 'Not found' }))

    expect(await reads.convention('nobody')).toBeNull()
  })

  it('fails when the API fails or refuses, so that nothing is taken for missing', async () => {
    const failing = setup(() => json(500, { code: 'server.error', message: 'Broken' }))
    await expect(failing.reads.convention('con-a')).rejects.toThrow()

    const refusing = setup(() => json(429, { code: 'request.too-many', message: 'Slow down' }))
    await expect(refusing.reads.convention('con-a')).rejects.toThrow()
  })

  it('fails when the API cannot be reached', async () => {
    const { reads } = setup(() => Promise.reject(new TypeError('fetch failed')))

    await expect(reads.convention('con-a')).rejects.toThrow()
  })

  it('gives up on an answer that does not come in time', async () => {
    const send = vi.fn(
      (_request: Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const reads = publicReads({ apiUrl: API, fetch: send, timeout: 20 })

    await expect(reads.convention('con-a')).rejects.toThrow()
  })

  it('asks the API once for what several pages need within a minute', async () => {
    const { reads, send } = setup(() => json(200, convention))

    await reads.convention('con-a')
    await reads.convention('con-a')

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('stands in for the API with what a convention said in the last minutes, never with a profile', async () => {
    let time = 0
    let answer = () => json(200, convention)
    const reads = publicReads({
      apiUrl: API,
      fetch: () => Promise.resolve(answer()),
      now: () => time,
    })
    await reads.convention('con-a')
    await reads.profile('profile-1')

    time = 60_000
    answer = () => json(500, { code: 'server.error', message: 'Broken' })

    // What an account withdrew or an admin took down is in no head a minute later
    expect(await reads.convention('con-a')).toEqual(convention)
    await expect(reads.profile('profile-1')).rejects.toThrow()
  })

  it('remembers that something is missing as it remembers what is there', async () => {
    const { reads, send } = setup(() =>
      json(404, { code: 'request.not-found', message: 'Not found' }),
    )

    await reads.profile('nobody')
    await reads.profile('nobody')

    expect(send).toHaveBeenCalledTimes(1)
  })
})
