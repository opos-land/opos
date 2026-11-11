import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { ORPCError } from '@orpc/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { InvitationPage } from './invitation-page'

const api = vi.hoisted(() => ({
  preview: vi.fn(),
  accept: vi.fn(),
}))

vi.mock('../api/invitations', () => ({
  invitationPreviewOptions: () => ({ queryKey: ['preview'], queryFn: api.preview }),
  acceptInvitationOptions: () => ({ mutationFn: api.accept }),
  membershipsKey: () => ['memberships'],
}))

const preview = {
  email: 'invitee@x.test',
  tenant: { name: 'Convention A' },
  validUntil: '2027-01-01T00:00:00.000Z',
}

function Probe() {
  const location = useLocation()
  return <p>at {location.pathname + location.search}</p>
}

function renderInvitation() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/invitation?token=t-1']}>
          <Routes>
            <Route path="/invitation" element={<InvitationPage />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  localStorage.clear()
  api.preview.mockReset().mockImplementation(() => new Promise(() => undefined))
  api.accept.mockReset()
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

  it('keeps the preview for a session that waits for its code, and offers to finish signing in', async () => {
    api.preview.mockResolvedValue(preview)
    useSession.setState({ status: 'mfa-required', account: null })

    renderInvitation()

    expect(await screen.findByText(/invited to the organizing team/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Finish signing in' }).getAttribute('href')).toBe(
      '/auth/mfa?redirect=%2Finvitation%3Ftoken%3Dt-1',
    )
    expect(screen.queryByText('I already have an account')).toBeNull()
  })

  it('leads to the code screen, back to this page with its token, when accepting wants the code', async () => {
    api.preview.mockResolvedValue(preview)
    api.accept.mockRejectedValue(new ORPCError('session.mfa-required', { status: 401 }))
    useSession.setState({
      status: 'ready',
      account: {
        id: 'a',
        email: 'invitee@x.test',
        firstName: null,
        lastName: null,
        locale: null,
        theme: null,
        mfaEnabled: true,
      },
    })

    renderInvitation()

    expect(
      await screen.findByText('at /auth/mfa?redirect=%2Finvitation%3Ftoken%3Dt-1'),
    ).toBeTruthy()
  })
})
