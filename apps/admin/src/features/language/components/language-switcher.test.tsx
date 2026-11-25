import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLocale, signedOutLocale } from '../../../shared/lib/i18n'
import { useSession } from '../../../shared/lib/session'
import { mergeSavedLanguage } from '../api/language'
import { LanguageSwitcher } from './language-switcher'

const save = vi.hoisted(() => vi.fn((_input: unknown) => Promise.resolve({ locale: 'en' })))

vi.mock('../api/language', () => ({
  saveLanguageOptions: () => ({ mutationFn: save }),
  mergeSavedLanguage: vi.fn(),
}))

const account = {
  id: 'a',
  email: 'a@x.test',
  firstName: null,
  lastName: null,
  nickname: null,
  nameOrder: 'nickname-middle' as const,
  locale: null,
  theme: null,
  mfaEnabled: false,
}

beforeEach(async () => {
  await loadLocale('pl')
  useSession.setState({ status: 'ready', account: null })
  save.mockClear()
  vi.mocked(mergeSavedLanguage).mockClear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// A signed-out switcher needs no query client: the screens before sign-in render it as it is.
const view = (wrap: (node: ReactNode) => ReactNode = (node) => node) => {
  render(<I18nProvider i18n={i18n}>{wrap(<LanguageSwitcher />)}</I18nProvider>)
  return userEvent.setup()
}

const withQueries = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
)

// Named in the language on screen: Polish until another is chosen.
const switcher = (name = 'Język') => screen.getByRole<HTMLSelectElement>('combobox', { name })

describe('LanguageSwitcher', () => {
  it('shows the language on screen, each language named in itself', () => {
    view()

    expect(switcher().value).toBe('pl')
    expect([...switcher().options].map((option) => [option.value, option.lang])).toEqual([
      ['en', 'en'],
      ['pl', 'pl'],
    ])
  })

  it('keeps the choice of a visitor with no account in this browser', async () => {
    const user = view()

    await user.selectOptions(switcher(), 'en')

    await waitFor(() => expect(i18n.locale).toBe('en'))
    expect(switcher('Language').value).toBe('en')
    expect(signedOutLocale()).toBe('en')
    expect(save).not.toHaveBeenCalled()
  })

  it('saves the chosen language on the signed-in account', async () => {
    useSession.setState({ status: 'ready', account })
    const user = view(withQueries)

    await user.selectOptions(switcher(), 'en')

    await waitFor(() => expect(save.mock.lastCall?.[0]).toEqual({ body: { locale: 'en' } }))
    await waitFor(() =>
      expect(mergeSavedLanguage).toHaveBeenCalledWith(expect.anything(), { locale: 'en' }),
    )
    await waitFor(() => expect(i18n.locale).toBe('en'))
    expect(signedOutLocale()).toBe('pl')
  })

  it('waits until it is known whether an account is signed in', () => {
    useSession.setState({ status: 'loading', account: null })
    view()

    expect(switcher().disabled).toBe(true)
  })
})
