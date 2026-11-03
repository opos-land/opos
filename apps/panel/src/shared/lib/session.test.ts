import { errorMessage } from '@opos/i18n/errors'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountClient } from './api'
import { describeError } from './errors'
import { announceAccountChange, signedIn, signedOut, startSession, useSession } from './session'
import { mfaRequired } from './session-store'

const account = (id: string) => ({
  id,
  email: `${id}@x.test`,
  firstName: null,
  lastName: null,
  locale: null,
  mfaEnabled: false,
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

  it('ends mfa-required, neither unavailable nor signed out, when GET /me wants the code', async () => {
    const calls = stubApi({ 'GET /me': [json(401, { code: 'session.mfa-required' })] })

    await startSession()

    expect(calls).toEqual(['GET /me'])
    expect(useSession.getState()).toMatchObject({ status: 'mfa-required', account: null })
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

  it('a session that now waits for its code tells the other tabs to drop the account they show', async () => {
    const { received } = otherTab()
    signedIn(account('a'))

    mfaRequired()
    await Promise.resolve()

    expect(received).toEqual([{ accountId: 'a' }, { accountId: null }])
    expect(useSession.getState()).toMatchObject({ status: 'mfa-required', account: null })
  })

  it('a session that waits for its code with no account to lose says nothing', async () => {
    const { received } = otherTab()
    useSession.setState({ status: 'ready', account: null })

    mfaRequired()
    await Promise.resolve()

    expect(received).toEqual([])
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

  it('a sign-in found at start is announced; a start that finds nobody announces nothing', async () => {
    const observer = otherTab()
    stubApi({ 'GET /me': [json(200, account('a'))] })

    await startSession()
    await Promise.resolve()
    expect(observer.received).toEqual([{ accountId: 'a' }])

    observer.received.length = 0
    stubApi({ 'GET /me': [invalid()], 'POST /auth/refresh': [invalid()] })
    useSession.setState({ status: 'loading', account: null })
    await startSession()
    await Promise.resolve()
    expect(observer.received).toEqual([])
  })

  it('following an announcement does not announce again', async () => {
    stubApi({ 'GET /me': [json(200, account('a')), json(200, account('b'))] })
    await startSession()
    const observer = otherTab()
    const sender = otherTab()
    observer.received.length = 0

    sender.channel.postMessage({ accountId: 'b' })
    await vi.waitFor(() => expect(useSession.getState().account?.id).toBe('b'))
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Only the sender's own message: this tab said nothing back.
    expect(observer.received).toEqual([{ accountId: 'b' }])
  })

  it('hearing a sign-out leaves a session that waits for its code on the code screen', async () => {
    stubApi({ 'GET /me': [json(401, { code: 'session.mfa-required' })] })
    await startSession()
    expect(useSession.getState()).toMatchObject({ status: 'mfa-required', account: null })
    const { channel } = otherTab()

    channel.postMessage({ accountId: null })
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(useSession.getState()).toMatchObject({ status: 'mfa-required', account: null })
  })

  it('hearing a sign-out does not announce it again', async () => {
    stubApi({ 'GET /me': [json(200, account('a'))] })
    await startSession()
    const observer = otherTab()
    const sender = otherTab()
    observer.received.length = 0

    sender.channel.postMessage({ accountId: null })
    await vi.waitFor(() => expect(useSession.getState().account).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(observer.received).toEqual([{ accountId: null }])
  })

  it('clears the old account at once on another id, and ends unavailable when GET /me fails', async () => {
    stubApi({ 'GET /me': [json(200, account('a'))] })
    await startSession()
    const { channel } = otherTab()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate
        return json(503, { code: 'server.unavailable' })
      }),
    )

    channel.postMessage({ accountId: 'b' })

    await vi.waitFor(() =>
      expect(useSession.getState()).toMatchObject({ status: 'loading', account: null }),
    )
    release()
    await vi.waitFor(() =>
      expect(useSession.getState()).toMatchObject({ status: 'unavailable', account: null }),
    )
  })

  it('an announcement during a start whose refresh failed leaves it unavailable, not signed out', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        if (new URL(request.url).pathname === '/auth/refresh') {
          await gate
          return json(503, { code: 'server.unavailable' })
        }
        return invalid()
      }),
    )
    const { channel } = otherTab()
    const start = startSession()
    await Promise.resolve()

    channel.postMessage({ accountId: null })
    await new Promise((resolve) => setTimeout(resolve, 10))
    release()
    await start

    expect(useSession.getState().status).toBe('unavailable')
  })

  describe('an answer that arrives after a newer change', () => {
    /** The first `GET /me` waits for the release it returns; the next ones answer at once. */
    function holdFirstAnswer(first: Response, ...later: Response[]) {
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      const answers = [gate.then(() => first), ...later.map((answer) => Promise.resolve(answer))]
      vi.stubGlobal(
        'fetch',
        vi.fn(() => answers.shift() ?? Promise.reject(new TypeError('no answer'))),
      )
      return release
    }

    const settled = () => new Promise((resolve) => setTimeout(resolve, 10))

    it('a 200 after another tab signed out shows no account and announces nothing', async () => {
      const release = holdFirstAnswer(json(200, account('a')))
      const observer = otherTab()
      const sender = otherTab()
      const start = startSession()

      sender.channel.postMessage({ accountId: null })
      await vi.waitFor(() => expect(useSession.getState().status).toBe('ready'))
      release()
      await start
      await settled()

      expect(useSession.getState()).toMatchObject({ status: 'ready', account: null })
      expect(observer.received).toEqual([{ accountId: null }])
    })

    it('a 200 after another tab switched accounts keeps the new account and announces nothing', async () => {
      const release = holdFirstAnswer(json(200, account('a')), json(200, account('b')))
      const observer = otherTab()
      const sender = otherTab()
      const start = startSession()

      sender.channel.postMessage({ accountId: 'b' })
      await vi.waitFor(() => expect(useSession.getState().account?.id).toBe('b'))
      release()
      await start
      await settled()

      expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'b' } })
      expect(observer.received).toEqual([{ accountId: 'b' }])
    })

    it('a failure after another tab switched accounts leaves the new account ready', async () => {
      const release = holdFirstAnswer(
        json(503, { code: 'server.unavailable' }),
        json(200, account('b')),
      )
      const sender = otherTab()
      const start = startSession()

      sender.channel.postMessage({ accountId: 'b' })
      await vi.waitFor(() => expect(useSession.getState().account?.id).toBe('b'))
      release()
      await start
      await settled()

      expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'b' } })
    })

    it('a 200 after this tab signed out shows no account', async () => {
      const release = holdFirstAnswer(json(200, account('a')))
      const start = startSession()

      signedOut()
      release()
      await start

      expect(useSession.getState()).toMatchObject({ status: 'ready', account: null })
    })

    it('a 200 after this tab signed in as someone else keeps that account', async () => {
      const release = holdFirstAnswer(json(200, account('a')))
      const start = startSession()

      signedIn(account('b'))
      release()
      await start

      expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'b' } })
    })

    it('the answer to the newer of two starts is the one that counts', async () => {
      const release = holdFirstAnswer(json(200, account('a')), json(200, account('b')))
      const first = startSession()
      const second = startSession()

      await second
      release()
      await first

      expect(useSession.getState()).toMatchObject({ status: 'ready', account: { id: 'b' } })
    })
  })
})

describe('what the screen says about a 401', () => {
  const failure = async () => {
    stubApi({
      'GET /me': [invalid()],
      'POST /auth/refresh': [json(503, { code: 'server.unavailable' })],
    })
    return accountClient.me.get().then(
      () => undefined,
      (error: unknown) => error,
    )
  }

  it('a refresh that was unavailable shows "try again" while the session is kept', async () => {
    useSession.setState({ status: 'ready', account: account('a') })

    const error = await failure()

    expect(describeError(error).message).toBe(errorMessage('server.unavailable'))
    expect(useSession.getState().account?.id).toBe('a')
  })

  it('a session that really ended keeps its own text', async () => {
    useSession.setState({ status: 'ready', account: null })

    const error = await failure()

    expect(describeError(error).message).toBe(errorMessage('session.invalid'))
  })
})
