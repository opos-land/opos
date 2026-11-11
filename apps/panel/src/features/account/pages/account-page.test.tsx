import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AccountPage } from './account-page'

const update = vi.hoisted(() => vi.fn((_input: unknown) => Promise.resolve({})))

vi.mock('../api/account', () => ({
  mergeSavedAccount: vi.fn(),
  accountOptions: () => ({
    queryKey: ['account'],
    queryFn: () =>
      Promise.resolve({
        id: 'a',
        email: 'a@x.test',
        firstName: null,
        lastName: null,
        locale: null,
        theme: null,
        mfaEnabled: false,
        signInMethods: ['password'],
      }),
  }),
  updateAccountOptions: () => ({ mutationFn: update }),
}))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

const renderPage = () =>
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AccountPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )

describe('AccountPage', () => {
  it('names the signed-in address', async () => {
    renderPage()

    expect(await screen.findByText('a@x.test')).toBeTruthy()
  })

  it('offers the interface language, the browser’s by default', async () => {
    renderPage()

    const select = await screen.findByLabelText<HTMLSelectElement>('Interface language')
    expect(select.value).toBe('browser')
  })

  it('offers the interface theme, the system’s by default', async () => {
    renderPage()

    const select = await screen.findByLabelText<HTMLSelectElement>('Interface theme')
    expect(select.value).toBe('system')
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "The system's theme",
      'Light',
      'Dark',
    ])
  })

  it('saves the chosen theme on the account, and the system’s as no theme', async () => {
    renderPage()
    const user = userEvent.setup()
    const select = await screen.findByLabelText<HTMLSelectElement>('Interface theme')
    const enabled = () => waitFor(() => expect(select.disabled).toBe(false))

    await enabled()
    await user.selectOptions(select, 'dark')
    await waitFor(() => expect(update.mock.lastCall?.[0]).toEqual({ body: { theme: 'dark' } }))

    await enabled()
    await user.selectOptions(select, 'system')
    await waitFor(() => expect(update.mock.lastCall?.[0]).toEqual({ body: { theme: null } }))
  })

  it('holds the two-factor card, off for an account without it', async () => {
    renderPage()

    expect(
      await screen.findByRole('button', { name: 'Turn on two-factor authentication' }),
    ).toBeTruthy()
  })
})
