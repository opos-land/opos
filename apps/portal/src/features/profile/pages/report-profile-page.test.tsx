import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportProfilePage } from './report-profile-page'

const api = vi.hoisted(() => ({ profile: vi.fn(), report: vi.fn() }))

vi.mock('../api/profile', () => ({
  publicProfileOptions: (profileId: string) => ({
    queryKey: ['profile', profileId],
    queryFn: () => api.profile(profileId) as Promise<unknown>,
  }),
  reportProfileOptions: () => ({ mutationFn: api.report }),
}))

const anna = {
  profileId: 'p-1',
  firstName: 'Anna',
  nickname: null,
  lastName: 'Nowak',
  nameOrder: 'nickname-middle',
  avatar: null,
  description: null,
  pronouns: null,
  city: null,
  links: [],
  interests: [],
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  api.profile.mockReset()
  api.profile.mockResolvedValue(anna)
  api.report.mockReset()
  api.report.mockResolvedValue(undefined)
})

afterEach(cleanup)

async function openPage() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/profiles/p-1/report']}>
          <Routes>
            <Route path="/profiles/:profileId/report" element={<ReportProfilePage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Report the profile of Anna Nowak' })
  return userEvent.setup()
}

const reason = () => screen.getByLabelText<HTMLSelectElement>('Why are you reporting it?')

// docs/specs/0016-public-profile.md, R1-R3 and R7.
describe('ReportProfilePage', () => {
  it('asks for one of the four reasons, and offers a note and an email address', async () => {
    await openPage()

    expect([...reason().options].map((option) => option.textContent)).toEqual([
      'Someone else’s picture or identity',
      'Offensive or unlawful content',
      'Spam or advertising',
      'Another reason',
    ])
    expect(screen.getByLabelText('What should we know? (optional)')).toBeTruthy()
    expect(screen.getByLabelText('Your email address (optional)')).toBeTruthy()
  })

  it('says what the address is for and that nothing else of the sender is kept', async () => {
    await openPage()

    expect(
      screen.getByText(
        'If you give an address, we write to it twice: that your report arrived, and what was decided. Only the administrators see it, and it is removed with the report. We keep nothing else about you.',
      ),
    ).toBeTruthy()
  })

  it('sends the reason alone when nothing else was given', async () => {
    const user = await openPage()

    await user.selectOptions(reason(), 'spam')
    await user.click(screen.getByRole('button', { name: 'Send the report' }))

    await waitFor(() =>
      expect(api.report.mock.lastCall?.[0]).toEqual({
        params: { profileId: 'p-1' },
        body: { reason: 'spam' },
        headers: {},
      }),
    )
  })

  it('sends the note and the address with the reason, and says the report arrived', async () => {
    const user = await openPage()

    await user.type(screen.getByLabelText('What should we know? (optional)'), ' Not her picture. ')
    await user.type(screen.getByLabelText('Your email address (optional)'), 'me@example.test')
    await user.click(screen.getByRole('button', { name: 'Send the report' }))

    await waitFor(() =>
      expect(api.report.mock.lastCall?.[0]).toEqual({
        params: { profileId: 'p-1' },
        body: { reason: 'identity', note: 'Not her picture.', email: 'me@example.test' },
        headers: {},
      }),
    )
    expect(
      await screen.findByText(
        'Your report has reached the administrators. They will look at the profile and decide whether it stays.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send the report' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to the profile' }).getAttribute('href')).toBe(
      '/profiles/p-1',
    )
  })

  it('refuses what is no email address and a note over 1000 characters, and sends nothing', async () => {
    const user = await openPage()

    await user.type(screen.getByLabelText('Your email address (optional)'), 'me')
    await user.click(screen.getByRole('button', { name: 'Send the report' }))
    expect(
      await screen.findByText('Enter an email address, or leave the field empty.'),
    ).toBeTruthy()

    await user.clear(screen.getByLabelText('Your email address (optional)'))
    await user.click(screen.getByLabelText('What should we know? (optional)'))
    await user.paste('x'.repeat(1001))
    await user.click(screen.getByRole('button', { name: 'Send the report' }))
    expect(await screen.findByText('Enter up to 1000 characters.')).toBeTruthy()
    expect(api.report).not.toHaveBeenCalled()
  })

  it('shows a profile that is not public as a page that is not there', async () => {
    api.profile.mockRejectedValue(new ORPCError('request.not-found', { status: 404 }))
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <I18nProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/profiles/p-9/report']}>
            <Routes>
              <Route path="/profiles/:profileId/report" element={<ReportProfilePage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })
})
