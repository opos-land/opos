import { type SupportedStorage } from '@supabase/auth-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { SupabaseAuthFactory } from './supabase-auth.factory'

const SECRET = 'sb_secret_test'
const CLIENT_IP = '2001:db8:1:2:3:4:5:6'

const factory = () =>
  new SupabaseAuthFactory({
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SECRET_KEY: SECRET,
  })

const session = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
}

/** Every call goes to this stub, which records the headers and answers `body`. */
function stubFetch(body: unknown = session) {
  const calls: { url: string; headers: Headers; body: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: input instanceof Request ? input.url : input.toString(),
        headers: new Headers(init?.headers),
        body: typeof init?.body === 'string' ? init.body : '',
      })
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }),
  )
  return calls
}

/** Runs `fn` inside a request store holding the client address. */
const inRequest = <T>(fn: () => T, clientIp = CLIENT_IP) =>
  new TenantContextService(undefined as never).run(fn, '2001:db8:1:2::/64', clientIp)

/** A storage that remembers what auth-js writes. */
function memoryStorage() {
  const items = new Map<string, string>()
  const storage: SupportedStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
  return { storage, items }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SupabaseAuthFactory', () => {
  it('sends apikey and the full client address, never the /64', async () => {
    const calls = stubFetch()

    await inRequest(() =>
      factory().forRequest().signInWithPassword({ email: 'a@b.test', password: 'x' }),
    )

    const { url, headers } = calls[0]!
    expect(url).toBe('http://supabase.test/auth/v1/token?grant_type=password')
    expect(headers.get('sb-forwarded-for')).toBe(CLIENT_IP)
    expect(headers.get('apikey')).toBe(SECRET)
  })

  it('sends the address on an admin call too', async () => {
    const calls = stubFetch({})

    await inRequest(() => factory().admin().getUserById('00000000-0000-4000-8000-000000000001'))

    expect(calls[0]!.headers.get('sb-forwarded-for')).toBe(CLIENT_IP)
  })

  it('never forwards the visitor user agent', async () => {
    const calls = stubFetch()

    await inRequest(() =>
      factory().forRequest().signInWithPassword({ email: 'a@b.test', password: 'x' }),
    )

    expect(calls[0]!.headers.get('user-agent') ?? '').not.toMatch(/Mozilla/)
  })

  it('sends no Authorization on an admin call', async () => {
    const calls = stubFetch({})

    await inRequest(() => factory().admin().getUserById('00000000-0000-4000-8000-000000000001'))

    expect(calls[0]!.headers.get('authorization')).toBeNull()
    expect(calls[0]!.headers.get('apikey')).toBe(SECRET)
  })

  it('shares no session between two clients of two requests', async () => {
    stubFetch()
    const first = factory().forRequest()
    const second = factory().forRequest()

    await first.signInWithPassword({ email: 'a@b.test', password: 'x' })

    expect((await first.getSession()).data.session?.access_token).toBe('access')
    expect((await second.getSession()).data.session).toBeNull()
  })

  it('the Google client writes its verifier to the storage it was given', async () => {
    const { storage, items } = memoryStorage()

    const { data } = await factory()
      .forGoogle(storage)
      .signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'http://api.test/auth/google/callback', skipBrowserRedirect: true },
      })

    expect([...items.keys()].some((key) => key.endsWith('-code-verifier'))).toBe(true)
    expect(new URL(data.url!).searchParams.get('code_challenge_method')).toBe('s256')
  })

  it('the request client runs no PKCE, so a sign-up carries no challenge', async () => {
    const calls = stubFetch({ user: session.user })

    await factory().forRequest().signUp({ email: 'a@b.test', password: 'x' })

    expect(JSON.parse(calls[0]!.body)).toMatchObject({ code_challenge: null })
  })
})
