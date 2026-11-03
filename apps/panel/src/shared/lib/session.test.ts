import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { announceAccountChange, signedIn, signedOut, startSession, useSession } from './session'

const account = (id: string) => ({
  id,
  email: `${id}@x.test`,
  firstName: null,
  lastName: null,
  locale: null,
  signInMethods: ['password'],
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Answers by method and path, in order; a function answer throws or returns the response. */
function stubApi(routes: Record<string, (Response | (() => Response))[]>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((request: Request) => {
      const key = `${request.method} ${new URL(request.url).pathname}`
      calls.push(key)
      const answer = routes[key]?.shift()
      if (!answer) return Promise.reject(new TypeError(`no answer for ${key}`))
      return Promise.resolve(typeof answer === 'function' ? answer() : answer)
    }),
  )
  return calls
}

const invalid = () => json(401, { code: 'session.invalid' })

class FakeChannel {
  static all: FakeChannel[] = []
  private listeners: ((event: { data: unknown }) => void)[] = []
  constructor(readonly name: string) {
    FakeChannel.all.push(this)
  }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void) {
    this.listeners.push(listener)
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.all) {
      if (other === this || other.name !== this.name) continue
      for (const listener of other.listeners) queueMicrotask(() => listener({ data }))
    }
  }
}

beforeAll(() => {
  vi.stubGlobal('BroadcastChannel', FakeChannel)
})

beforeEach(() => {
  useSession.setState({ status: 'loading', account: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('BroadcastChannel', FakeChannel)
})

describe('startSession', () => {
  it('ends ready with an account from GET /me', async () => {
    stubApi({ 'GET /me': [json(200, account('a'))] })

    await startSession()

    expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'a' } })
  })

  it('ends ready with an account after one refresh on a 401', async () => {
    const calls = stubApi({
      'GET /me': [invalid(), json(200, account('a'))],
      'POST /auth/refresh': [new Response(null, { status: 204 })],
    })

    await startSession()

    expect(calls).toEqual(['GET /me', 'POST /auth/refresh', 'GET /me'])
    expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'a' } })
  })

  it('ends ready with no account on 401', async () => {
    stubApi({ 'GET /me': [invalid()], 'POST /auth/refresh': [invalid()] })

    await startSession()

    expect(useSession.getState()).toMatchObject({ status: 'ready', account: null })
  })

  it('ends unavailable on a network failure, never stuck loading', async () => {
    stubApi({})

    await startSession()

    expect(useSession.getState()).toMatchObject({ status: 'unavailable', account: null })
  })

  it('ends unavailable on a 503 from GET /me', async () => {
    stubApi({ 'GET /me': [json(503, { code: 'server.unavailable' })] })

    await startSession()

    expect(useSession.getState().status).toBe('unavailable')
  })

  it('ends unavailable, not signed out, when the refresh could not be made', async () => {
    stubApi({
      'GET /me': [invalid()],
      'POST /auth/refresh': [json(503, { code: 'server.unavailable' })],
    })

    await startSession()

    expect(useSession.getState()).toMatchObject({ status: 'unavailable', account: null })
  })

  it('can be tried again from unavailable', async () => {
    stubApi({ 'GET /me': [json(503, { code: 'server.unavailable' }), json(200, account('a'))] })

    await startSession()
    const retry = startSession()
    expect(useSession.getState().status).toBe('loading')
    await retry

    expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'a' } })
  })
})

describe('across tabs', () => {
  const otherTab = () => {
    const channel = new FakeChannel('opos-panel-session')
    const received: unknown[] = []
    channel.addEventListener('message', (event) => received.push(event.data))
    return { channel, received }
  }

  it('announces a sign-in and a sign-out on opos-panel-session', async () => {
    const { received } = otherTab()

    signedIn(account('a'))
    signedOut()
    await Promise.resolve()

    expect(received).toEqual([{ accountId: 'a' }, { accountId: null }])
    expect(useSession.getState()).toMatchObject({ status: 'ready', account: null })
  })

  it('says nothing when there was no account to sign out', async () => {
    const { received } = otherTab()
    useSession.setState({ status: 'ready', account: null })

    signedOut()
    await Promise.resolve()

    expect(received).toEqual([])
  })

  it('announceAccountChange sends the id to the other tabs', async () => {
    const { received } = otherTab()

    announceAccountChange('b')
    await Promise.resolve()

    expect(received).toEqual([{ accountId: 'b' }])
  })

  it('another tab signing in as someone else loads that account here', async () => {
    stubApi({ 'GET /me': [json(200, account('a')), json(200, account('b'))] })
    await startSession()
    const { channel } = otherTab()

    channel.postMessage({ accountId: 'b' })

    await vi.waitFor(() => expect(useSession.getState().account?.id).toBe('b'))
  })

  it('another tab signing out signs this one out without a request', async () => {
    const calls = stubApi({ 'GET /me': [json(200, account('a'))] })
    await startSession()
    const { channel } = otherTab()

    channel.postMessage({ accountId: null })

    await vi.waitFor(() => expect(useSession.getState().account).toBeNull())
    expect(calls).toEqual(['GET /me'])
  })

  it('ignores an announcement of the account it already shows, or one it cannot read', async () => {
    const calls = stubApi({ 'GET /me': [json(200, account('a'))] })
    await startSession()
    const { channel } = otherTab()

    channel.postMessage({ accountId: 'a' })
    channel.postMessage('garbage')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(calls).toEqual(['GET /me'])
    expect(useSession.getState().account?.id).toBe('a')
  })
})
