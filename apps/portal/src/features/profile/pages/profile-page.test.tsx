import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type PublicProfile } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from './profile-page'

const api = vi.hoisted(() => ({ profile: vi.fn() }))

vi.mock('../api/profile', () => ({
  publicProfileOptions: (profileId: string) => ({
    queryKey: ['profile', profileId],
    queryFn: () => api.profile(profileId) as Promise<unknown>,
  }),
}))

const anna: PublicProfile = {
  profileId: 'p-1',
  firstName: 'Anna',
  nickname: 'Lisek',
  lastName: 'Nowak',
  nameOrder: 'nickname-middle',
  avatar: { fileId: 'file-1' },
  description: 'Game master.\nSince 2010.',
  pronouns: 'she/her',
  city: 'Gdynia',
  links: ['https://example.test/me', 'https://other.test/?a=1'],
  interests: ['larp', 'tabletop-rpg'],
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  api.profile.mockReset()
  api.profile.mockResolvedValue(anna)
})

afterEach(cleanup)

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/profiles/p-1']}>
          <Routes>
            <Route path="/profiles/:profileId" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content')

// docs/specs/0016-public-profile.md, P8-P12.
describe('ProfilePage', () => {
  it('shows the public name, the avatar and what the profile holds', async () => {
    view()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Anna “Lisek” Nowak' }),
    ).toBeTruthy()
    expect(api.profile).toHaveBeenCalledWith('p-1')
    expect(
      screen.getByRole('img', { name: 'Avatar of Anna “Lisek” Nowak' }).getAttribute('src'),
    ).toMatch(/\/public\/avatar-files\/file-1\/large$/)
    expect(screen.getByText('she/her')).toBeTruthy()
    expect(screen.getByText('Gdynia')).toBeTruthy()
    expect(screen.getByText('LARP')).toBeTruthy()
    expect(screen.getByText('Tabletop role-playing games')).toBeTruthy()
  })

  it('keeps the line breaks of the description and makes nothing in it a link', async () => {
    api.profile.mockResolvedValue({ ...anna, description: 'See https://spam.test\nBye.' })
    view()

    const description = await screen.findByText(/See https:\/\/spam\.test/)
    expect(description.textContent).toBe('See https://spam.test\nBye.')
    expect(description.className).toContain('whitespace-pre-line')
    expect(screen.queryByRole('link', { name: /spam\.test/ })).toBeNull()
  })

  // P4: a link is shown as its address, opens in a new tab and vouches for nothing.
  it('shows each link as its address, opening in a new tab and vouching for nothing', async () => {
    view()

    const link = await screen.findByRole('link', { name: 'https://example.test/me' })
    expect(link.getAttribute('href')).toBe('https://example.test/me')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc')
    expect(screen.getByRole('link', { name: 'https://other.test/?a=1' })).toBeTruthy()
  })

  it('names an account with no part of a name Anon, by its initial when it has no avatar', async () => {
    api.profile.mockResolvedValue({
      ...anna,
      firstName: null,
      nickname: null,
      lastName: null,
      avatar: null,
      description: null,
      pronouns: null,
      city: null,
      links: [],
      interests: [],
    })
    view()

    expect(await screen.findByRole('heading', { level: 1, name: 'Anon' })).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('This profile holds nothing yet.')).toBeTruthy()
  })

  it('offers to report the profile', async () => {
    view()

    const report = await screen.findByRole('link', { name: 'Report this profile' })
    expect(report.getAttribute('href')).toBe('/profiles/p-1/report')
  })

  it('asks search engines not to list the page, for as long as it is shown', async () => {
    const { unmount } = view()
    await screen.findByRole('heading', { level: 1 })

    expect(robots()).toBe('noindex')
    unmount()
    expect(robots()).toBeUndefined()
  })

  // P9.
  it('shows a profile that is not public as a page that is not there', async () => {
    api.profile.mockRejectedValue(new ORPCError('request.not-found', { status: 404 }))
    view()

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Report this profile' })).toBeNull()
  })
})
