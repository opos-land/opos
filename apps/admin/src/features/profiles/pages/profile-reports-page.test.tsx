import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type ListedProfileReport } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileReportsPage } from './profile-reports-page'

const load = vi.fn<(state: string) => Promise<unknown>>()

vi.mock('../api/profiles', () => ({
  profileReportsOptions: (state: string) => ({
    queryKey: ['admin', 'profile-reports', state],
    queryFn: () => load(state),
    retry: false,
  }),
}))

const report = (override: Partial<ListedProfileReport> = {}): ListedProfileReport => ({
  id: 'r-1',
  accountId: 'a-1',
  reason: 'identity',
  note: 'Not her picture.',
  email: 'someone@example.test',
  createdAt: '2026-11-20T10:00:00.000Z',
  closedAt: null,
  account: {
    firstName: 'Anna',
    nickname: 'Lisek',
    lastName: 'Nowak',
    nameOrder: 'nickname-middle',
  },
  ...override,
})

function renderPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/profile-reports']}>
          <ProfileReportsPage />
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
})

afterEach(cleanup)

const rows = () => screen.getAllByRole('row').slice(1)

// docs/specs/0016-public-profile.md, T1.
describe('ProfileReportsPage', () => {
  it('lists the open reports with their reason, whose profile each is of and what it says', async () => {
    load.mockResolvedValue([
      report(),
      report({
        id: 'r-2',
        reason: 'spam',
        note: null,
        email: null,
        account: { firstName: null, nickname: null, lastName: null, nameOrder: 'nickname-middle' },
      }),
    ])
    renderPage()

    const [first, second] = await vi.waitFor(() => {
      const found = rows()
      expect(found).toHaveLength(2)
      return found
    })
    expect(load).toHaveBeenCalledWith('open')
    expect(within(first!).getByRole('link', { name: 'Anna “Lisek” Nowak' })).toBeTruthy()
    expect(within(first!).getByText('Someone else’s picture or identity')).toBeTruthy()
    expect(within(first!).getByText('Not her picture.')).toBeTruthy()
    expect(within(first!).getByText('someone@example.test')).toBeTruthy()
    expect(within(second!).getByRole('link', { name: 'Anon' })).toBeTruthy()
    expect(within(second!).getByText('Spam or advertising')).toBeTruthy()
  })

  it('opens the page of a report from its row', async () => {
    load.mockResolvedValue([report()])
    renderPage()

    const link = await screen.findByRole('link', { name: 'Anna “Lisek” Nowak' })
    expect(link.getAttribute('href')).toBe('/profile-reports/r-1')
  })

  it('shows the closed reports when asked', async () => {
    const user = renderPage()
    await screen.findByText('No report is open.')

    load.mockResolvedValue([report({ closedAt: '2026-11-21T10:00:00.000Z' })])
    await user.selectOptions(screen.getByLabelText('Show'), 'closed')

    expect(await screen.findByRole('link', { name: 'Anna “Lisek” Nowak' })).toBeTruthy()
    expect(load).toHaveBeenLastCalledWith('closed')
  })

  it('says that no report is open instead of an empty table', async () => {
    renderPage()

    expect(await screen.findByText('No report is open.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
