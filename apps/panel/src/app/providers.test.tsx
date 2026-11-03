import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startSession, useSession } from '../shared/lib/session'
import { AccountChangeCleanup } from './providers'

const accountOf = (id: string) => ({
  id,
  email: `${id}@x.test`,
  firstName: null,
  lastName: null,
  locale: null,
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

beforeEach(() => {
  useSession.setState({ status: 'ready', account: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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
    useSession.setState({ status: 'ready', account: accountOf('a') })
    const onChange = setup()
    await startSession()
    // The tab shows account a again; account b signs in elsewhere.
    useSession.setState({ account: accountOf('a') })
    onChange.mockClear()
    new FakeChannel('opos-panel-session').postMessage({ accountId: 'b' })

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce())
    expect(useSession.getState().account?.id).toBe('b')
  })
})
