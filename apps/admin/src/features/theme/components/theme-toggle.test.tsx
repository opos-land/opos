import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { applyTheme, signedOutTheme } from '../../../shared/lib/theme'
import { mergeSavedTheme } from '../api/theme'
import { ThemeToggle } from './theme-toggle'

const save = vi.hoisted(() => vi.fn((_input: unknown) => Promise.resolve({ theme: 'dark' })))

vi.mock('../api/theme', () => ({
  saveThemeOptions: () => ({ mutationFn: save }),
  mergeSavedTheme: vi.fn(),
}))

const account = {
  id: 'a',
  email: 'a@x.test',
  firstName: null,
  lastName: null,
  locale: null,
  theme: null,
  mfaEnabled: false,
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  applyTheme('light')
  useSession.setState({ status: 'ready', account: null })
  save.mockClear()
  vi.mocked(mergeSavedTheme).mockClear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// A signed-out toggle needs no query client: the screens before sign-in render it as it is.
const view = (wrap: (node: ReactNode) => ReactNode = (node) => node) => {
  render(<I18nProvider i18n={i18n}>{wrap(<ThemeToggle />)}</I18nProvider>)
  return userEvent.setup()
}

const withQueries = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
)

const toggle = () => screen.getByRole('button', { name: 'Dark theme' })

describe('ThemeToggle', () => {
  it('says whether the dark theme is on', () => {
    view()
    expect(toggle().getAttribute('aria-pressed')).toBe('false')

    cleanup()
    applyTheme('dark')
    view()
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps the choice of a visitor with no account in this browser', async () => {
    const user = view()

    await user.click(toggle())

    expect(toggle().getAttribute('aria-pressed')).toBe('true')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(signedOutTheme()).toBe('dark')
    expect(save).not.toHaveBeenCalled()

    await user.click(toggle())
    expect(signedOutTheme()).toBe('light')
  })

  it('saves the opposite of the theme on screen on the signed-in account', async () => {
    useSession.setState({ status: 'ready', account })
    const user = view(withQueries)

    await user.click(toggle())

    await waitFor(() => expect(save.mock.lastCall?.[0]).toEqual({ body: { theme: 'dark' } }))
    await waitFor(() =>
      expect(mergeSavedTheme).toHaveBeenCalledWith(expect.anything(), { theme: 'dark' }),
    )
    expect(signedOutTheme()).toBeNull()
  })

  it('waits until it is known whether an account is signed in', () => {
    useSession.setState({ status: 'loading', account: null })
    view()

    expect((toggle() as HTMLButtonElement).disabled).toBe(true)
  })
})
