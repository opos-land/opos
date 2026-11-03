import { afterEach, describe, expect, it, vi } from 'vitest'
import { acrossTabs, createApiFetch, type RefreshResult, requestRefresh, shared } from './api-fetch'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const invalid = () => json(401, { code: 'session.invalid' })

function setup(refresh: () => Promise<RefreshResult> = () => Promise.resolve('refreshed')) {
  return { refresh: vi.fn(refresh), onSignedOut: vi.fn(), onMfaRequired: vi.fn() }
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
  it('sends cookies and never an Authorization header', async () => {
    const { fetch, requests } = recorder(json(200, {}))

    await createApiFetch({ ...setup(), tenantSlug: 'con-a', locale: () => 'pl', fetch })(
      new Request('http://api.test/tenants/current'),
    )

    expect(requests[0]!.credentials).toBe('include')
    expect(requests[0]!.headers.has('authorization')).toBe(false)
    expect(requests[0]!.headers.get('x-tenant-slug')).toBe('con-a')
    expect(requests[0]!.headers.get('accept-language')).toBe('pl')
  })

  it('sends no X-Tenant-Slug outside a tenant', async () => {
    const { fetch, requests } = recorder(json(200, {}))

    await createApiFetch({ ...setup(), locale: () => 'en', fetch })(
      new Request('http://api.test/x'),
    )

    expect(requests[0]!.headers.has('x-tenant-slug')).toBe(false)
  })

  it('a 401 session.invalid refreshes once and retries once, with the same body', async () => {
    const { fetch, requests } = recorder(invalid(), json(201, { ok: 1 }))
    const options = setup()

    const response = await createApiFetch({ ...options, locale: () => 'pl', fetch })(
      new Request('http://api.test/editions', { method: 'POST', body: '{"name":"2027"}' }),
    )

    expect(response.status).toBe(201)
    expect(options.refresh).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(2)
    expect(requests[1]!.credentials).toBe('include')
    expect(await requests[1]!.text()).toBe('{"name":"2027"}')
    expect(options.onSignedOut).not.toHaveBeenCalled()
  })

  it('a failed refresh with signed-out calls onSignedOut and retries nothing', async () => {
    const { fetch, requests } = recorder(invalid())
    const options = setup(() => Promise.resolve('signed-out'))

    const response = await createApiFetch({ ...options, locale: () => 'pl', fetch })(
      new Request('http://api.test/me'),
    )

    expect(response.status).toBe(401)
    expect(requests).toHaveLength(1)
    expect(options.onSignedOut).toHaveBeenCalledTimes(1)
  })

  it('a refresh that is unavailable keeps the session and returns the original response', async () => {
    const { fetch, requests } = recorder(invalid())
    const options = setup(() => Promise.resolve('unavailable'))

    const response = await createApiFetch({ ...options, locale: () => 'pl', fetch })(
      new Request('http://api.test/me'),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ code: 'session.invalid' })
    expect(requests).toHaveLength(1)
    expect(options.onSignedOut).not.toHaveBeenCalled()
  })

  it('a network failure during refresh keeps the session', async () => {
    const { fetch } = recorder(invalid())
    const options = setup(() => Promise.reject(new TypeError('Failed to fetch')))

    const response = await createApiFetch({ ...options, locale: () => 'pl', fetch })(
      new Request('http://api.test/me'),
    )

    expect(response.status).toBe(401)
    expect(options.onSignedOut).not.toHaveBeenCalled()
  })

  it('retries once only: a second 401 signs out', async () => {
    const { fetch, requests } = recorder(invalid(), invalid())
    const options = setup()

    const response = await createApiFetch({ ...options, locale: () => 'pl', fetch })(
      new Request('http://api.test/me'),
    )

    expect(response.status).toBe(401)
    expect(requests).toHaveLength(2)
    expect(options.refresh).toHaveBeenCalledTimes(1)
    expect(options.onSignedOut).toHaveBeenCalledTimes(1)
  })

  it('session.reauthentication-required never refreshes', async () => {
    const { fetch, requests } = recorder(json(401, { code: 'session.reauthentication-required' }))
    const options = setup()

    const response = await createApiFetch({ ...options, locale: () => 'pl', fetch })(
      new Request('http://api.test/me', { method: 'DELETE' }),
    )

    expect(response.status).toBe(401)
    expect(requests).toHaveLength(1)
    expect(options.refresh).not.toHaveBeenCalled()
    expect(options.onSignedOut).not.toHaveBeenCalled()
  })

  it('session.mfa-required never refreshes and tells the application', async () => {
    const { fetch, requests } = recorder(json(401, { code: 'session.mfa-required' }))
    const options = setup()

    const response = await createApiFetch({ ...options, locale: () => 'pl', fetch })(
      new Request('http://api.test/me'),
    )

    expect(response.status).toBe(401)
    expect(requests).toHaveLength(1)
    expect(options.refresh).not.toHaveBeenCalled()
    expect(options.onSignedOut).not.toHaveBeenCalled()
    expect(options.onMfaRequired).toHaveBeenCalledOnce()
  })

  it('tells the application nothing for any other answer', async () => {
    const { fetch } = recorder(
      json(401, { code: 'session.reauthentication-required' }),
      json(200, {}),
    )
    const options = setup()
    const apiFetch = createApiFetch({ ...options, locale: () => 'pl', fetch })

    await apiFetch(new Request('http://api.test/me', { method: 'DELETE' }))
    await apiFetch(new Request('http://api.test/me'))

    expect(options.onMfaRequired).not.toHaveBeenCalled()
  })

  it('passes other errors through without a refresh', async () => {
    const { fetch } = recorder(json(403, { code: 'permission.denied' }))
    const options = setup()

    const response = await createApiFetch({ ...options, locale: () => 'pl', fetch })(
      new Request('http://api.test/editions'),
    )

    expect(response.status).toBe(403)
    expect(options.refresh).not.toHaveBeenCalled()
  })

  it('leaves a 401 without a readable body alone', async () => {
    const { fetch } = recorder(new Response('nope', { status: 401 }))
    const options = setup()

    const response = await createApiFetch({ ...options, locale: () => 'pl', fetch })(
      new Request('http://api.test/me'),
    )

    expect(response.status).toBe(401)
    expect(options.refresh).not.toHaveBeenCalled()
  })

  describe('two tabs', () => {
    afterEach(() => {
      Reflect.deleteProperty(navigator, 'locks')
    })

    /** A Web Locks stand-in that hands the lock to one holder at a time, in arrival order. */
    function fakeLocks() {
      let tail: Promise<unknown> = Promise.resolve()
      const requested: string[] = []
      return {
        requested,
        request: <T>(name: string, callback: () => Promise<T>) => {
          requested.push(name)
          const held = tail.then(callback)
          tail = held.catch(() => undefined)
          return held
        },
      }
    }

    /**
     * The API's rotation: a refresh cookie works once. The cookie is read, the request takes a
     * while, and only then does it rotate; a cookie that was spent meanwhile ends the session.
     */
    function cookieJar() {
      const jar = { cookie: 'a', calls: [] as string[] }
      const rotate = async (): Promise<RefreshResult> => {
        const presented = jar.cookie
        jar.calls.push(presented)
        await new Promise((resolve) => setTimeout(resolve, 0))
        if (jar.cookie !== presented) return 'signed-out'
        jar.cookie = `${presented}'`
        return 'refreshed'
      }
      return { jar, rotate }
    }

    it('two tabs refreshing take the lock in turn and both stay signed in', async () => {
      const locks = fakeLocks()
      Object.defineProperty(navigator, 'locks', { value: locks, configurable: true })
      const { jar, rotate } = cookieJar()
      const onSignedOut = vi.fn()
      const tab = () =>
        createApiFetch({
          refresh: shared(acrossTabs('opos-panel-refresh', rotate)),
          onSignedOut,
          onMfaRequired: vi.fn(),
          locale: () => 'en',
          fetch: vi.fn().mockResolvedValueOnce(invalid()).mockResolvedValueOnce(json(200, {})),
        })

      const responses = await Promise.all([
        tab()(new Request('http://api.test/me')),
        tab()(new Request('http://api.test/me')),
      ])

      expect(locks.requested).toEqual(['opos-panel-refresh', 'opos-panel-refresh'])
      expect(jar.calls).toEqual(['a', "a'"])
      expect(responses.map((response) => response.status)).toEqual([200, 200])
      expect(onSignedOut).not.toHaveBeenCalled()
    })

    it('without the lock the second tab presents a spent cookie and is signed out', async () => {
      const { rotate } = cookieJar()
      const onSignedOut = vi.fn()
      const tab = () =>
        createApiFetch({
          refresh: shared(rotate),
          onSignedOut,
          onMfaRequired: vi.fn(),
          locale: () => 'en',
          fetch: vi.fn().mockResolvedValueOnce(invalid()).mockResolvedValueOnce(json(200, {})),
        })

      await Promise.all([
        tab()(new Request('http://api.test/me')),
        tab()(new Request('http://api.test/me')),
      ])

      expect(onSignedOut).toHaveBeenCalledOnce()
    })

    it('works without navigator.locks', async () => {
      expect('locks' in navigator).toBe(false)
      const run = vi.fn(() => Promise.resolve('refreshed' as const))

      expect(await acrossTabs('opos-panel-refresh', run)()).toBe('refreshed')
      expect(run).toHaveBeenCalledOnce()
    })
  })
})

describe('requests of one tab', () => {
  it('two requests refused together share one refresh', async () => {
    let resolve!: (value: RefreshResult) => void
    const refresh = vi.fn(() => new Promise<RefreshResult>((r) => (resolve = r)))
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(invalid())
      .mockResolvedValueOnce(invalid())
      .mockResolvedValue(json(200, {}))
    const apiFetch = createApiFetch({
      refresh: shared(refresh),
      onSignedOut: vi.fn(),
      onMfaRequired: vi.fn(),
      locale: () => 'en',
      fetch,
    })

    const both = Promise.all([
      apiFetch(new Request('http://api.test/a')),
      apiFetch(new Request('http://api.test/b')),
    ])
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
    resolve('refreshed')

    expect((await both).map((response) => response.status)).toEqual([200, 200])
    expect(refresh).toHaveBeenCalledOnce()
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

describe('requestRefresh', () => {
  const answer = (status: number) =>
    vi.fn((_request: Request) => Promise.resolve(new Response(null, { status })))

  it('posts to /auth/refresh with the cookies and no body', async () => {
    const send = answer(204)

    expect(await requestRefresh('http://api.test', send)).toBe('refreshed')

    const request = send.mock.calls[0]![0]
    expect(request.url).toBe('http://api.test/auth/refresh')
    expect(request.method).toBe('POST')
    expect(request.credentials).toBe('include')
  })

  it.each([
    [401, 'signed-out'],
    [429, 'unavailable'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [403, 'unavailable'],
  ])('a %s is %s', async (status, expected) => {
    expect(await requestRefresh('http://api.test', answer(status))).toBe(expected)
  })

  it('a network failure is unavailable', async () => {
    const send = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))

    expect(await requestRefresh('http://api.test', send)).toBe('unavailable')
  })
})
