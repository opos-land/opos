import { i18n } from '@lingui/core'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLocale } from '../shared/lib/i18n'
import { startSession, useSession } from '../shared/lib/session'
import { toast } from '../shared/ui'
import { AccountChangeCleanup, Providers, SignedOutLocale } from './providers'

vi.mock('../shared/lib/i18n', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadLocale: vi.fn(() => Promise.resolve()),
}))

const accountOf = (id: string) => ({
  id,
  email: `${id}@x.test`,
  firstName: null,
  lastName: null,
  locale: null,
  theme: null,
  mfaEnabled: false,
})

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
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  useSession.setState({ status: 'ready', account: null })
  vi.mocked(loadLocale).mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Providers', () => {
  it('closes the notifications of an account another account replaces', async () => {
    useSession.setState({ status: 'ready', account: accountOf('a') })
    render(
      <Providers>
        <p>page</p>
      </Providers>,
    )
    const warning = 'No confirmed account uses the email address nobody@x.test.'
    act(() => {
      toast.add({ type: 'warning', title: warning, timeout: 0 })
    })
    expect(await screen.findByText(warning)).toBeDefined()

    act(() => useSession.setState({ account: accountOf('b') }))

    await vi.waitFor(() => expect(screen.queryByText(warning)).toBeNull())
  })
})

describe('AccountChangeCleanup', () => {
  const setup = () => {
    const onChange = vi.fn()
    render(<AccountChangeCleanup onChange={onChange} />)
    return onChange
  }

  it('clears on sign-out', () => {
    useSession.setState({ account: accountOf('a') })
    const onChange = setup()

    act(() => useSession.setState({ account: null }))

    expect(onChange).toHaveBeenCalledOnce()
  })

  it("clears when another account's session replaces the current one", () => {
    useSession.setState({ account: accountOf('a') })
    const onChange = setup()

    act(() => useSession.setState({ account: accountOf('b') }))

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('keeps everything on a refresh of the same account, or the first sign-in', () => {
    const onChange = setup()

    act(() => useSession.setState({ account: accountOf('a') }))
    act(() => useSession.setState({ account: accountOf('a') }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('an account change announced by another tab clears the query cache', async () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ...accountOf('b'), signInMethods: ['password'] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )
    let queryClient!: QueryClient
    function Capture() {
      queryClient = useQueryClient()
      return null
    }
    useSession.setState({ status: 'ready', account: accountOf('a') })
    render(
      <Providers>
        <Capture />
      </Providers>,
    )
    await startSession()
    // The tab shows account a again; account b signs in elsewhere.
    useSession.setState({ account: accountOf('a') })
    queryClient.setQueryData(['account', 'me'], { name: 'a' })
    expect(queryClient.getQueryData(['account', 'me'])).toBeDefined()

    new FakeChannel('opos-portal-session').postMessage({ accountId: 'b' })

    await vi.waitFor(() => expect(useSession.getState().account?.id).toBe('b'))
    expect(queryClient.getQueryData(['account', 'me'])).toBeUndefined()
  })
})

describe('SignedOutLocale', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['pl-PL', 'en'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("switches back to the browser's language when the session ends", () => {
    useSession.setState({ account: accountOf('a') })
    render(<SignedOutLocale />)

    act(() => useSession.setState({ account: null }))

    expect(loadLocale).toHaveBeenCalledExactlyOnceWith('pl')
  })

  it('leaves the language to the account while there is a session', () => {
    render(<SignedOutLocale />)

    act(() => useSession.setState({ account: accountOf('a') }))
    act(() => useSession.setState({ account: accountOf('b') }))

    expect(loadLocale).not.toHaveBeenCalled()
  })

  it('switches back when another tab announces the end of the session', async () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ...accountOf('a'), signInMethods: ['password'] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )
    render(
      <Providers>
        <p>page</p>
      </Providers>,
    )
    await startSession()
    expect(useSession.getState().account?.id).toBe('a')
    vi.mocked(loadLocale).mockClear()

    new FakeChannel('opos-portal-session').postMessage({ accountId: null })

    await vi.waitFor(() => expect(loadLocale).toHaveBeenCalledExactlyOnceWith('pl'))
  })
})
