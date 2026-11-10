import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AccountPage } from './account-page'

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
        mfaEnabled: false,
        signInMethods: ['password'],
      }),
  }),
  updateAccountOptions: () => ({ mutationFn: () => Promise.resolve({}) }),
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

  it('holds the two-factor card, off for an account without it', async () => {
    renderPage()

    expect(
      await screen.findByRole('button', { name: 'Turn on two-factor authentication' }),
    ).toBeTruthy()
  })
})
