import { describe, expect, it, vi } from 'vitest'
import { type ApiSession, createApiFetch, shared } from './api-fetch'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function session(overrides: Partial<ApiSession> = {}) {
  return {
    accessToken: vi.fn(() => Promise.resolve<string | null>('old-token')),
    refresh: vi.fn(() => Promise.resolve<string | null>('new-token')),
    signOut: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
}

function recorder(...responses: Response[]) {
  const requests: Request[] = []
  const fetch = vi.fn((request: Request) => {
    requests.push(request)
    return Promise.resolve(responses.shift() ?? json(200, {}))
  })
  return { fetch, requests }
}

describe('createApiFetch', () => {
  it('attaches the access token, the tenant and the language', async () => {
    const { fetch, requests } = recorder(json(200, {}))
    const apiFetch = createApiFetch({
      session: session(),
      tenantSlug: 'con-a',
      locale: () => 'pl',
      fetch,
    })

    await apiFetch(new Request('http://api.test/tenants/current'))

    expect(requests[0]!.headers.get('authorization')).toBe('Bearer old-token')
    expect(requests[0]!.headers.get('x-tenant-slug')).toBe('con-a')
    expect(requests[0]!.headers.get('accept-language')).toBe('pl')
  })

  it('sends no Authorization and no X-Tenant-Slug without a session or a tenant', async () => {
    const { fetch, requests } = recorder(json(200, {}))
    const s = session({ accessToken: vi.fn(() => Promise.resolve(null)) })

    await createApiFetch({ session: s, locale: () => 'en', fetch })(
      new Request('http://api.test/x'),
    )

    expect(requests[0]!.headers.has('authorization')).toBe(false)
    expect(requests[0]!.headers.has('x-tenant-slug')).toBe(false)
  })

  it('answers a 401 with one refresh and a retry with the new token and the same body', async () => {
    const { fetch, requests } = recorder(
      json(401, { code: 'session.invalid' }),
      json(201, { ok: 1 }),
    )
    const s = session()
    const apiFetch = createApiFetch({ session: s, locale: () => 'pl', fetch })

    const response = await apiFetch(
      new Request('http://api.test/editions', { method: 'POST', body: '{"name":"2027"}' }),
    )

    expect(response.status).toBe(201)
    expect(s.refresh).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(2)
    expect(requests[1]!.headers.get('authorization')).toBe('Bearer new-token')
    expect(await requests[1]!.text()).toBe('{"name":"2027"}')
    expect(s.signOut).not.toHaveBeenCalled()
  })

  it('signs out when the refresh fails, and retries nothing', async () => {
    const { fetch, requests } = recorder(json(401, { code: 'session.invalid' }))
    const s = session({ refresh: vi.fn(() => Promise.resolve(null)) })

    const response = await createApiFetch({ session: s, locale: () => 'pl', fetch })(
      new Request('http://api.test/me'),
    )

    expect(response.status).toBe(401)
    expect(requests).toHaveLength(1)
    expect(s.signOut).toHaveBeenCalledTimes(1)
  })

  it('signs out when the refresh throws', async () => {
    const { fetch } = recorder(json(401, { code: 'session.invalid' }))
    const s = session({ refresh: vi.fn(() => Promise.reject(new Error('offline'))) })

    await createApiFetch({ session: s, locale: () => 'pl', fetch })(
      new Request('http://api.test/me'),
    )

    expect(s.signOut).toHaveBeenCalledTimes(1)
  })

  it('retries once only: a second 401 signs out', async () => {
    const { fetch, requests } = recorder(
      json(401, { code: 'session.invalid' }),
      json(401, { code: 'session.invalid' }),
    )
    const s = session()

    const response = await createApiFetch({ session: s, locale: () => 'pl', fetch })(
      new Request('http://api.test/me'),
    )

    expect(response.status).toBe(401)
    expect(requests).toHaveLength(2)
    expect(s.refresh).toHaveBeenCalledTimes(1)
    expect(s.signOut).toHaveBeenCalledTimes(1)
  })

  it('does not refresh for a request that needs a recent sign-in', async () => {
    const { fetch, requests } = recorder(json(401, { code: 'session.reauthentication-required' }))
    const s = session()

    const response = await createApiFetch({ session: s, locale: () => 'pl', fetch })(
      new Request('http://api.test/me', { method: 'DELETE' }),
    )

    expect(response.status).toBe(401)
    expect(requests).toHaveLength(1)
    expect(s.refresh).not.toHaveBeenCalled()
    expect(s.signOut).not.toHaveBeenCalled()
  })

  it('leaves a 401 alone when there was no session to refresh', async () => {
    const { fetch } = recorder(json(401, { code: 'session.invalid' }))
    const s = session({ accessToken: vi.fn(() => Promise.resolve(null)) })

    const response = await createApiFetch({ session: s, locale: () => 'pl', fetch })(
      new Request('http://api.test/me'),
    )

    expect(response.status).toBe(401)
    expect(s.refresh).not.toHaveBeenCalled()
    expect(s.signOut).not.toHaveBeenCalled()
  })

  it('passes other errors through without a refresh', async () => {
    const { fetch } = recorder(json(403, { code: 'permission.denied' }))
    const s = session()

    const response = await createApiFetch({ session: s, locale: () => 'pl', fetch })(
      new Request('http://api.test/editions'),
    )

    expect(response.status).toBe(403)
    expect(s.refresh).not.toHaveBeenCalled()
  })
})

describe('shared', () => {
  it('runs the function once for concurrent callers and again afterwards', async () => {
    let resolve!: (value: string) => void
    const fn = vi.fn(() => new Promise<string>((r) => (resolve = r)))
    const once = shared(fn)

    const both = Promise.all([once(), once()])
    resolve('token')

    expect(await both).toEqual(['token', 'token'])
    expect(fn).toHaveBeenCalledTimes(1)
    void once()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
