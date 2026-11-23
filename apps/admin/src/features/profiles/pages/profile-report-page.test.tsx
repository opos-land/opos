import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type AdminProfileReport } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileReportPage } from './profile-report-page'

const load = vi.fn<() => Promise<unknown>>()
const close = vi.fn<(input: unknown) => Promise<unknown>>()

vi.mock('../api/profiles', () => ({
  adminKey: () => ['admin'],
  profileReportOptions: (id: string) => ({
    queryKey: ['admin', 'profile-report', id],
    queryFn: () => load(),
    retry: false,
  }),
  closeProfileReportOptions: () => ({ mutationFn: (input: unknown) => close(input) }),
}))

const report = (override: Partial<AdminProfileReport> = {}): AdminProfileReport => ({
  id: 'r-1',
  accountId: 'a-1',
  reason: 'offensive',
  note: 'Look at the description.',
  email: 'someone@example.test',
  createdAt: '2026-11-20T10:00:00.000Z',
  closedAt: null,
  ...override,
})

function renderPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/profile-reports/r-1']}>
          <Routes>
            <Route path="/profile-reports/:reportId" element={<ProfileReportPage />} />
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
  load.mockResolvedValue(report())
  close.mockReset()
  close.mockResolvedValue({
    report: report({ closedAt: '2026-11-21T10:00:00.000Z' }),
    emailSent: true,
  })
})

afterEach(cleanup)

// docs/specs/0016-public-profile.md, T1, R6 and T13.
describe('ProfileReportPage', () => {
  it('shows what the report says, and leads to the profile it reports', async () => {
    renderPage()

    expect(await screen.findByText('Offensive or unlawful content')).toBeTruthy()
    expect(screen.getByText('Look at the description.')).toBeTruthy()
    expect(screen.getByText('someone@example.test')).toBeTruthy()
    expect(screen.getByText('Open')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open the reported profile' }).getAttribute('href'),
    ).toBe('/profiles/a-1')
  })

  it('says that a report gave no note and no address', async () => {
    load.mockResolvedValue(report({ note: null, email: null }))
    renderPage()

    expect(await screen.findByText('The report holds no note.')).toBeTruthy()
    expect(
      screen.getByText('Who sent it gave no address, so nobody is told what came of it.'),
    ).toBeTruthy()
  })

  it('closes the report only from a modal, which says that the profile stays', async () => {
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Close the report' }))
    expect(close).not.toHaveBeenCalled()
    const modal = within(await screen.findByRole('alertdialog'))
    expect(modal.getByText(/The profile stays as it is/)).toBeTruthy()
    await user.click(modal.getByRole('button', { name: 'Close the report' }))

    await waitFor(() => expect(close).toHaveBeenCalledWith({ params: { reportId: 'r-1' } }))
  })

  it('offers no closing of a report that is closed', async () => {
    load.mockResolvedValue(report({ closedAt: '2026-11-21T10:00:00.000Z' }))
    renderPage()

    expect(await screen.findByText('Closed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close the report' })).toBeNull()
  })

  it('shows the not-found screen for an identifier that names no report', async () => {
    load.mockRejectedValue(new ORPCError('request.not-found', { status: 404 }))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })
})
