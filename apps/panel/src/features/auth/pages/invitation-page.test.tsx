import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { InvitationPage } from './invitation-page'

vi.mock('../api/invitations', () => ({
  invitationPreviewOptions: () => ({
    queryKey: ['preview'],
    queryFn: () => new Promise(() => undefined),
  }),
}))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(cleanup)

describe('InvitationPage', () => {
  it('offers to try again, and no sign-in options, when the account could not be asked for', () => {
    useSession.setState({ status: 'unavailable', account: null })

    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={['/invitation?token=t-1']}>
            <InvitationPage />
          </MemoryRouter>
        </QueryClientProvider>
      </I18nProvider>,
    )

    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('I already have an account')).toBeNull()
  })
})
