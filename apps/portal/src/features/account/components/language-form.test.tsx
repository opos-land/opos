import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LanguageForm } from './language-form'

const update = vi.hoisted(() => vi.fn((_input: unknown) => Promise.resolve({ locale: 'en' })))

vi.mock('../api/account', () => ({
  mergeSavedAccount: vi.fn(),
  updateAccountOptions: () => ({ mutationFn: update }),
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

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

const renderForm = (locale: 'en' | 'pl' | null = null) =>
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <LanguageForm account={{ ...account, locale }} />
      </QueryClientProvider>
    </I18nProvider>,
  )

const select = () => screen.getByLabelText<HTMLSelectElement>('Interface language')

describe('LanguageForm', () => {
  it('offers the interface languages, Polish for an account with no choice', () => {
    renderForm()

    expect(select().value).toBe('pl')
    expect([...select().options].map((option) => option.value)).toEqual(['en', 'pl'])
  })

  it("shows the account's choice", () => {
    renderForm('en')

    expect(select().value).toBe('en')
  })

  it('saves the chosen language on the account', async () => {
    renderForm()

    await userEvent.setup().selectOptions(select(), 'en')

    await waitFor(() => expect(update.mock.lastCall?.[0]).toEqual({ body: { locale: 'en' } }))
  })
})
