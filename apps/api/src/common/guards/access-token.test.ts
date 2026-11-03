import { randomUUID } from 'node:crypto'
import { Logger } from '@nestjs/common'
import { CompactSign, type CryptoKey, exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type AccessTokenVerifier,
  bearerToken,
  createAccessTokenVerifier,
  lastSignInAt,
  signInMethodsOf,
} from './access-token'

describe('bearerToken', () => {
  it.each([
    ['Bearer abc', 'abc'],
    ['bearer abc', undefined],
    ['Bearer ', undefined],
    ['Bearer a b', undefined],
    [undefined, undefined],
    [['Bearer abc'], undefined],
  ])('reads %o as %o', (header, expected) => {
    expect(bearerToken(header)).toBe(expected)
  })
})

describe('lastSignInAt', () => {
  it('takes the newest amr timestamp', () => {
    const amr = [
      { method: 'password', timestamp: 100 },
      { method: 'oauth', timestamp: 300 },
      { method: 'otp', timestamp: 200 },
    ]

    expect(lastSignInAt({ amr })).toBe(300)
  })

  it.each([
    ['no amr', {}],
    ['an amr that is not a list', { amr: 'password' }],
    ['entries without a timestamp', { amr: [{ method: 'password' }, null, { timestamp: '5' }] }],
  ])('finds no sign-in in %s', (_, payload) => {
    expect(lastSignInAt(payload)).toBeUndefined()
  })
})

describe('signInMethodsOf', () => {
  it.each([
    [['email'], ['password']],
    [['google'], ['google']],
    [
      ['email', 'google'],
      ['password', 'google'],
    ],
    [
      ['google', 'email'],
      ['password', 'google'],
    ],
    [['github', 'email'], ['password']],
  ])('reads providers %j as %j', (providers, expected) => {
    expect(signInMethodsOf({ app_metadata: { providers } })).toEqual(expected)
  })

  it.each([
    ['no app_metadata', {}],
    ['providers that are no list', { app_metadata: { providers: 'google' } }],
    ['a list of other things', { app_metadata: { providers: [1, null, {}] } }],
  ])('finds no method in %s', (_, payload) => {
    expect(signInMethodsOf(payload)).toEqual([])
  })
})

describe('createAccessTokenVerifier', () => {
  const SUPABASE_URL = 'http://supabase.test'
  const jwksUrl = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
  const start = new Date('2030-01-01T00:00:00Z')

  interface Pair {
    kid: string
    privateKey: CryptoKey
    publicJwk: JWK
  }
  const makePair = async (kid: string): Promise<Pair> => {
    const { privateKey, publicKey } = await generateKeyPair('ES256')
    return { kid, privateKey, publicJwk: { ...(await exportJWK(publicKey)), kid, alg: 'ES256' } }
  }

  interface Claims {
    sub?: string
    iss?: string
    aud?: string
    exp?: string | null
    extra?: Record<string, unknown>
  }
  const sign = (pair: Pair, claims: Claims = {}) => {
    const jwt = new SignJWT({ role: 'authenticated', ...claims.extra })
      .setProtectedHeader({ alg: 'ES256', kid: pair.kid })
      .setSubject(claims.sub ?? randomUUID())
      .setAudience(claims.aud ?? 'authenticated')
      .setIssuer(claims.iss ?? `${SUPABASE_URL}/auth/v1`)
    if (claims.exp !== null) jwt.setExpirationTime(claims.exp ?? '5m')
    return jwt.sign(pair.privateKey)
  }

  /** A fetch that serves the key set `published` holds at the moment of the call. */
  const serving = (published: { keys: JWK[] }) =>
    vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ keys: published.keys })))

  let current: Pair
  let published: { keys: JWK[] }
  let fetchStub: ReturnType<typeof serving>
  let verifiers: AccessTokenVerifier[]
  const make = (options: Parameters<typeof createAccessTokenVerifier>[1] = {}) => {
    const verifier = createAccessTokenVerifier({ SUPABASE_URL }, { fetch: fetchStub, ...options })
    verifiers.push(verifier)
    return verifier
  }

  beforeEach(async () => {
    vi.useFakeTimers({ now: start })
    current = await makePair('key-1')
    published = { keys: [current.publicJwk] }
    fetchStub = serving(published)
    verifiers = []
  })

  afterEach(() => {
    for (const verifier of verifiers) verifier.close()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('accepts a token signed by the published key', async () => {
    const sub = randomUUID()
    const amr = [{ method: 'password', timestamp: 1_900_000_000 }]
    const token = await sign(current, { sub, extra: { aal: 'aal2', amr } })

    const check = await make().verify(token)

    expect(check).toMatchObject({ status: 'valid', payload: { sub, aal: 'aal2', amr } })
    expect(fetchStub).toHaveBeenCalledTimes(1)
    expect(fetchStub.mock.calls[0]?.[0]).toBe(jwksUrl)
  })

  it('does not break on a trailing slash in the project address', async () => {
    const verifier = createAccessTokenVerifier(
      { SUPABASE_URL: `${SUPABASE_URL}/` },
      { fetch: fetchStub },
    )
    verifiers.push(verifier)

    expect((await verifier.verify(await sign(current))).status).toBe('valid')
    expect(fetchStub.mock.calls[0]?.[0]).toBe(jwksUrl)
  })

  const unsigned = () => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const claims = {
      sub: randomUUID(),
      aud: 'authenticated',
      iss: `${SUPABASE_URL}/auth/v1`,
      exp: Math.floor(start.getTime() / 1000) + 300,
    }
    return `${part({ alg: 'none' })}.${part(claims)}.`
  }

  const forgedCrit = async (pair: Pair) => {
    const [, payload, signature] = (await sign(pair)).split('.')
    const header = Buffer.from(
      JSON.stringify({ alg: 'ES256', kid: pair.kid, crit: ['exp-ext'], 'exp-ext': 1 }),
    ).toString('base64url')
    return `${header}.${payload}.${signature}`
  }

  it.each<[string, (pair: Pair) => Promise<string> | string]>([
    ['wrong iss', (pair) => sign(pair, { iss: 'http://evil.test/auth/v1' })],
    ['wrong aud', (pair) => sign(pair, { aud: 'anon' })],
    [
      'HS256',
      () =>
        new SignJWT({})
          .setProtectedHeader({ alg: 'HS256', kid: 'key-1' })
          .setSubject(randomUUID())
          .setAudience('authenticated')
          .setIssuer(`${SUPABASE_URL}/auth/v1`)
          .setExpirationTime('5m')
          .sign(new TextEncoder().encode('x'.repeat(32))),
    ],
    ['alg none', unsigned],
    ['no exp', (pair) => sign(pair, { exp: null })],
    [
      'no sub',
      (pair) =>
        new SignJWT({})
          .setProtectedHeader({ alg: 'ES256', kid: pair.kid })
          .setAudience('authenticated')
          .setIssuer(`${SUPABASE_URL}/auth/v1`)
          .setExpirationTime('5m')
          .sign(pair.privateKey),
    ],
    ['non-uuid sub', (pair) => sign(pair, { sub: 'not-a-uuid' })],
    ['expired', (pair) => sign(pair, { exp: '-1m' })],
    ['is_anonymous true', (pair) => sign(pair, { extra: { is_anonymous: true } })],
    ['foreign key', async () => sign(await makePair('key-1'))],
    ['garbage', () => 'not.a.jwt'],
    ['a crit header the library does not support', forgedCrit],
    [
      'a payload that is not a claims object (JWTInvalid)',
      (pair) =>
        new CompactSign(new TextEncoder().encode('"not an object"'))
          .setProtectedHeader({ alg: 'ES256', kid: pair.kid })
          .sign(pair.privateKey),
    ],
  ])('is invalid: %s', async (_, build) => {
    expect(await make().verify(await build(current))).toEqual({ status: 'invalid' })
  })

  it('is invalid when the key set holds two keys for one kid', async () => {
    const twin = await makePair(current.kid)
    published.keys = [current.publicJwk, twin.publicJwk]

    expect(await make().verify(await sign(current))).toEqual({ status: 'invalid' })
  })

  it('is invalid for an unknown kid when the key set answers without it', async () => {
    const verifier = make()
    await verifier.verify(await sign(current))
    vi.setSystemTime(start.getTime() + 31_000)

    expect(await verifier.verify(await sign(await makePair('key-2')))).toEqual({
      status: 'invalid',
    })
    expect(fetchStub).toHaveBeenCalledTimes(2)
  })

  it('is invalid for a newly published kid inside the 30 s cooldown, without a new fetch', async () => {
    const verifier = make()
    await verifier.verify(await sign(current))
    const next = await makePair('key-2')
    published.keys = [current.publicJwk, next.publicJwk]
    vi.setSystemTime(start.getTime() + 29_000)

    expect(await verifier.verify(await sign(next))).toEqual({ status: 'invalid' })
    expect(fetchStub).toHaveBeenCalledTimes(1)
  })

  it('accepts a new kid published after the cache filled, once the cooldown has passed', async () => {
    const verifier = make()
    await verifier.verify(await sign(current))
    const next = await makePair('key-2')
    published.keys = [current.publicJwk, next.publicJwk]
    vi.setSystemTime(start.getTime() + 31_000)

    expect((await verifier.verify(await sign(next))).status).toBe('valid')
    expect(fetchStub).toHaveBeenCalledTimes(2)
  })

  it.each<[string, () => typeof fetch]>([
    ['the request fails', () => vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))],
    [
      'the answer is a 500',
      () => vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 500 }))),
    ],
    [
      'the answer is not a key set',
      () => vi.fn<typeof fetch>(() => Promise.resolve(new Response('<html>'))),
    ],
    [
      'the request times out',
      () =>
        vi
          .fn<typeof fetch>()
          .mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError')),
    ],
  ])('is unavailable when the first key fetch fails: %s', async (_, failing) => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const verifier = make({ fetch: failing() })

    expect(await verifier.verify(await sign(current))).toEqual({ status: 'unavailable' })
  })

  it('logs why a verification reads unavailable, with its cause and no token', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const failing = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }))
    const token = await sign(current)

    await make({ fetch: failing }).verify(token)

    expect(warn).toHaveBeenCalledOnce()
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('fetch failed')
    expect(message).toContain('ECONNREFUSED')
    expect(message).not.toContain(token)
  })

  it('logs nothing for a token that is simply invalid', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})

    await make().verify(await sign(current, { exp: '-1m' }))

    expect(warn).not.toHaveBeenCalled()
  })

  it('recovers when the keys come back after a failed first fetch', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const flaky = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockImplementation(() => Promise.resolve(Response.json({ keys: published.keys })))
    const verifier = make({ fetch: flaky })
    const token = await sign(current)

    expect((await verifier.verify(token)).status).toBe('unavailable')
    expect((await verifier.verify(token)).status).toBe('valid')
  })

  it('keeps verifying on the last good keys when a refresh fails, past 10 minutes', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const verifier = make({ refreshEveryMs: 600_000 })
    expect((await verifier.verify(await sign(current))).status).toBe('valid')
    fetchStub.mockRejectedValue(new TypeError('offline', { cause: new Error('ECONNREFUSED') }))

    await vi.advanceTimersByTimeAsync(3_600_000)

    expect((await verifier.verify(await sign(current))).status).toBe('valid')
    expect(fetchStub.mock.calls.length).toBeGreaterThan(1)
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('ECONNREFUSED')
  })

  it('picks up a key removed from the set at the next background refresh', async () => {
    const verifier = make({ refreshEveryMs: 600_000 })
    const token = await sign(current, { exp: '2h' })
    expect((await verifier.verify(token)).status).toBe('valid')
    published.keys = [(await makePair('key-2')).publicJwk]

    expect((await verifier.verify(token)).status).toBe('valid')
    await vi.advanceTimersByTimeAsync(600_000)

    expect(await verifier.verify(token)).toEqual({ status: 'invalid' })
  })

  it('refreshes the keys every 10 minutes by default', async () => {
    make()

    await vi.advanceTimersByTimeAsync(599_000)
    expect(fetchStub).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchStub).toHaveBeenCalledTimes(1)
  })

  it('holds an unref timer that close stops', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const verifier = make()

    expect(vi.getTimerCount()).toBe(1)
    const timer = setIntervalSpy.mock.results[0]?.value as NodeJS.Timeout
    expect(timer.hasRef()).toBe(false)
    verifier.close()
    expect(vi.getTimerCount()).toBe(0)
  })
})
