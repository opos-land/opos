import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type TakenDownProfile } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TakenDownProfilesPage } from './taken-down-profiles-page'

const load = vi.fn<() => Promise<unknown>>()
const find = vi.fn<(input: unknown) => Promise<unknown>>()

vi.mock('../api/profiles', () => ({
  takenDownProfilesOptions: () => ({
    queryKey: ['admin', 'profiles'],
    queryFn: () => load(),
    retry: false,
  }),
  findAccountOptions: () => ({ mutationFn: (input: unknown) => find(input) }),
}))

const taken = (override: Partial<TakenDownProfile> = {}): TakenDownProfile => ({
  accountId: 'a-1',
  email: 'anna@example.test',
  firstName: 'Anna',
  nickname: null,
  lastName: 'Nowak',
  nameOrder: 'nickname-middle',
  avatar: null,
  takenDownAt: '2026-11-20T10:00:00.000Z',
  reason: 'spam',
  reviewRequestedAt: null,
  ...override,
})

function Where() {
  return <p>{`at ${useLocation().pathname}`}</p>
}

function renderPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/profiles']}>
          <Routes>
            <Route path="/profiles" element={<TakenDownProfilesPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return userEvent.setup()
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  load.mockReset()
  load.mockResolvedValue([])
  find.mockReset()
})

afterEach(cleanup)

// docs/specs/0016-public-profile.md, T8 and T14.
describe('TakenDownProfilesPage', () => {
  it('lists the profiles taken down with their reason, and marks those asking for a review', async () => {
    load.mockResolvedValue([
      taken({ accountId: 'a-2', firstName: 'Jan', reviewRequestedAt: '2026-11-21T10:00:00.000Z' }),
      taken(),
    ])
    renderPage()

    const [asking, waiting] = await vi.waitFor(() => {
      const found = screen.getAllByRole('row').slice(1)
      expect(found).toHaveLength(2)
      return found
    })
    expect(within(asking!).getByRole('link', { name: 'Jan Nowak' }).getAttribute('href')).toBe(
      '/profiles/a-2',
    )
    expect(within(asking!).getByText('Review requested')).toBeTruthy()
    expect(within(waiting!).getByRole('link', { name: 'Anna Nowak' })).toBeTruthy()
    expect(within(waiting!).queryByText('Review requested')).toBeNull()
    expect(within(waiting!).getByText('Spam or advertising')).toBeTruthy()
    expect(within(waiting!).getByText('anna@example.test')).toBeTruthy()
  })

  it('says that no profile is taken down instead of an empty table', async () => {
    renderPage()

    expect(await screen.findByText('No profile is taken down.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('opens the page of the account an email address names', async () => {
    find.mockResolvedValue({ accountId: 'a-9' })
    const user = renderPage()

    await user.type(
      await screen.findByLabelText('Email address of the account'),
      ' Ola@Example.test ',
    )
    await user.click(screen.getByRole('button', { name: 'Open the account' }))

    await waitFor(() => expect(find).toHaveBeenCalledWith({ body: { email: 'Ola@Example.test' } }))
    expect(await screen.findByText('at /profiles/a-9')).toBeTruthy()
  })

  it('says that no account uses an address, and stays', async () => {
    find.mockRejectedValue(new ORPCError('account.not-found', { status: 404 }))
    const user = renderPage()

    await user.type(
      await screen.findByLabelText('Email address of the account'),
      'nobody@example.test',
    )
    await user.click(screen.getByRole('button', { name: 'Open the account' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/^at /)).toBeNull()
  })

  it('opens no account for what is no email address', async () => {
    const user = renderPage()

    await user.type(await screen.findByLabelText('Email address of the account'), 'ola')

    expect(screen.getByRole('button', { name: 'Open the account' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(find).not.toHaveBeenCalled()
  })
})
