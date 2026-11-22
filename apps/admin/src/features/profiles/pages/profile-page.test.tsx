import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type AdminProfile } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from './profile-page'

const load = vi.fn<() => Promise<unknown>>()
const takeDown = vi.fn<(input: unknown) => Promise<unknown>>()
const restore = vi.fn<(input: unknown) => Promise<unknown>>()
const clearName = vi.fn<(input: unknown) => Promise<unknown>>()

vi.mock('../api/profiles', () => ({
  adminKey: () => ['admin'],
  adminProfileOptions: (id: string) => ({
    queryKey: ['admin', 'profile', id],
    queryFn: () => load(),
    retry: false,
  }),
  takeDownProfileOptions: () => ({ mutationFn: (input: unknown) => takeDown(input) }),
  restoreProfileOptions: () => ({ mutationFn: (input: unknown) => restore(input) }),
  clearAccountNameOptions: () => ({ mutationFn: (input: unknown) => clearName(input) }),
}))

const profile = (override: Partial<AdminProfile> = {}): AdminProfile => ({
  accountId: 'a-1',
  email: 'anna@example.test',
  firstName: 'Anna',
  nickname: 'Lisek',
  lastName: 'Nowak',
  nameOrder: 'nickname-middle',
  exists: true,
  profileId: 'p-1',
  published: true,
  avatar: { fileId: 'file-1' },
  takedown: null,
  description: 'Game master.',
  pronouns: 'she/her',
  city: 'Gdynia',
  links: ['https://example.test/me'],
  interests: ['larp'],
  reports: [
    {
      id: 'r-1',
      accountId: 'a-1',
      reason: 'spam',
      note: 'Advertising.',
      email: null,
      createdAt: '2026-11-20T10:00:00.000Z',
      closedAt: null,
    },
  ],
  ...override,
})

const takenDown = profile({
  published: false,
  profileId: null,
  avatar: null,
  takedown: {
    at: '2026-11-20T10:00:00.000Z',
    reason: 'identity',
    note: 'The picture shows someone else.',
    afterReport: true,
    reviewRequested: true,
  },
})

function renderPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/profiles/a-1']}>
          <Routes>
            <Route path="/profiles/:accountId" element={<ProfilePage />} />
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
  for (const call of [load, takeDown, restore, clearName]) call.mockReset()
  load.mockResolvedValue(profile())
  for (const call of [takeDown, restore, clearName]) {
    call.mockResolvedValue({ profile: profile(), emailSent: true })
  }
})

afterEach(cleanup)

// docs/specs/0016-public-profile.md, T2-T13.
describe('ProfilePage', () => {
  it('shows a profile as it is now: the name, the address, the avatar, what it holds and its state', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Anna “Lisek” Nowak' }),
    ).toBeTruthy()
    expect(screen.getByText('anna@example.test')).toBeTruthy()
    expect(screen.getByText('Published')).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'Avatar of Anna “Lisek” Nowak' }).getAttribute('src'),
    ).toMatch(/\/public\/avatar-files\/file-1\/large$/)
    expect(screen.getByText('Game master.')).toBeTruthy()
    expect(screen.getByText('she/her')).toBeTruthy()
    expect(screen.getByText('Gdynia')).toBeTruthy()
    expect(screen.getByText('https://example.test/me')).toBeTruthy()
    expect(screen.getByText('LARP')).toBeTruthy()
  })

  it('lists the reports of the profile, each leading to its page', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: 'Spam or advertising' })
    expect(link.getAttribute('href')).toBe('/profile-reports/r-1')
    expect(screen.getByText('Advertising.')).toBeTruthy()
  })

  // T3 and T13: the modal of a takedown takes its reason.
  it('takes the profile down only from a modal that takes the reason and a sentence for the account', async () => {
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Take the profile down' }))
    expect(takeDown).not.toHaveBeenCalled()
    const modal = within(await screen.findByRole('alertdialog'))
    expect(
      [...modal.getByLabelText<HTMLSelectElement>('Reason').options].map((o) => o.textContent),
    ).toEqual([
      'Someone else’s picture or identity',
      'Offensive or unlawful content',
      'Spam or advertising',
    ])
    await user.selectOptions(modal.getByLabelText('Reason'), 'spam')
    await user.type(modal.getByLabelText('A sentence for the account (optional)'), ' Advertising. ')
    await user.click(modal.getByRole('button', { name: 'Take the profile down' }))

    await waitFor(() =>
      expect(takeDown).toHaveBeenCalledWith({
        params: { accountId: 'a-1' },
        body: { reason: 'spam', note: 'Advertising.' },
      }),
    )
  })

  it('sends a takedown with no sentence when none was written', async () => {
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Take the profile down' }))
    const modal = within(await screen.findByRole('alertdialog'))
    await user.click(modal.getByRole('button', { name: 'Take the profile down' }))

    await waitFor(() =>
      expect(takeDown).toHaveBeenCalledWith({
        params: { accountId: 'a-1' },
        body: { reason: 'identity' },
      }),
    )
  })

  // T5-T9.
  it('says of a profile taken down why, and that its account asked for a review, and restores it without asking', async () => {
    load.mockResolvedValue(takenDown)
    const user = renderPage()

    expect(await screen.findByText('Taken down')).toBeTruthy()
    expect(screen.getByText('Review requested')).toBeTruthy()
    expect(screen.getByText('The picture shows someone else.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Take the profile down' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Restore the profile' }))

    await waitFor(() => expect(restore).toHaveBeenCalledWith({ params: { accountId: 'a-1' } }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  // T10 and T13.
  it('clears the name only from a modal that takes the reason', async () => {
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Clear the name' }))
    expect(clearName).not.toHaveBeenCalled()
    const modal = within(await screen.findByRole('alertdialog'))
    await user.selectOptions(modal.getByLabelText('Reason'), 'offensive')
    await user.click(modal.getByRole('button', { name: 'Clear the name' }))

    await waitFor(() =>
      expect(clearName).toHaveBeenCalledWith({
        params: { accountId: 'a-1' },
        body: { reason: 'offensive' },
      }),
    )
  })

  it('offers no clearing of a name that has no part, and shows the account as Anon', async () => {
    load.mockResolvedValue(
      profile({ firstName: null, nickname: null, lastName: null, avatar: null, reports: [] }),
    )
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Anon' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear the name' })).toBeNull()
    expect(screen.getByText('This account has no part of a name.')).toBeTruthy()
    expect(screen.getByText('Nobody reported this profile.')).toBeTruthy()
  })

  // An account opened by its email address may never have touched its profile: nothing is there
  // to take down, and the API would answer that it found none.
  it('offers no takedown of an account that has no profile, and still clears its name', async () => {
    load.mockResolvedValue(
      profile({
        exists: false,
        profileId: null,
        published: false,
        avatar: null,
        description: null,
        pronouns: null,
        city: null,
        links: [],
        interests: [],
        reports: [],
      }),
    )
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Anna “Lisek” Nowak' }),
    ).toBeTruthy()
    expect(
      screen.getByText('This account has no profile yet, so there is nothing to take down.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Take the profile down' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restore the profile' })).toBeNull()
    expect(screen.queryByText('Private')).toBeNull()
    expect(screen.getByText('No profile')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear the name' })).toBeTruthy()
  })

  it('shows the not-found screen for an identifier that names no account', async () => {
    load.mockRejectedValue(new ORPCError('request.not-found', { status: 404 }))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })
})
