import { type Session } from '@supabase/auth-js'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLocale } from '../shared/lib/i18n'
import { useSession } from '../shared/lib/session'
import { AccountChangeCleanup, SignedOutLocale } from './providers'

vi.mock('../shared/lib/i18n', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadLocale: vi.fn(() => Promise.resolve()),
}))

const sessionOf = (id: string) => ({ user: { id } }) as Session

beforeEach(() => {
  useSession.setState({ status: 'ready', session: null })
})

afterEach(cleanup)

describe('AccountChangeCleanup', () => {
  const setup = () => {
    const onChange = vi.fn()
    render(<AccountChangeCleanup onChange={onChange} />)
    return onChange
  }

  it('clears on sign-out', () => {
    useSession.setState({ session: sessionOf('a') })
    const onChange = setup()

    act(() => useSession.setState({ session: null }))

    expect(onChange).toHaveBeenCalledOnce()
  })

  it("clears when another account's session replaces the current one", () => {
    useSession.setState({ session: sessionOf('a') })
    const onChange = setup()

    act(() => useSession.setState({ session: sessionOf('b') }))

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('keeps everything on a refresh of the same account, or the first sign-in', () => {
    const onChange = setup()

    act(() => useSession.setState({ session: sessionOf('a') }))
    act(() => useSession.setState({ session: sessionOf('a') }))

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('SignedOutLocale', () => {
  beforeEach(() => {
    vi.mocked(loadLocale).mockClear()
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['pl-PL', 'en'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("switches back to the browser's language when the session ends", () => {
    useSession.setState({ session: sessionOf('a') })
    render(<SignedOutLocale />)

    act(() => useSession.setState({ session: null }))

    expect(loadLocale).toHaveBeenCalledExactlyOnceWith('pl')
  })

  it('leaves the language to the account while there is a session', () => {
    render(<SignedOutLocale />)

    act(() => useSession.setState({ session: sessionOf('a') }))
    act(() => useSession.setState({ session: sessionOf('b') }))

    expect(loadLocale).not.toHaveBeenCalled()
  })
})
