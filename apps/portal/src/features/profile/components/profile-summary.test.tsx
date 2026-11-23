import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type MyProfile } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileSummary } from './profile-summary'

const empty: MyProfile = {
  profileId: null,
  published: false,
  avatar: null,
  takedown: null,
  description: null,
  pronouns: null,
  city: null,
  links: [],
  interests: [],
}

const state = vi.hoisted((): { profile: MyProfile | undefined } => ({ profile: undefined }))

const anna = { firstName: 'Anna', nickname: null, lastName: 'Nowak', nameOrder: 'nickname-middle' }

vi.mock('../api/profile', () => ({
  // The account as `GET /me` answers it, which saving a name on the same page writes into.
  accountOptions: () => ({ queryKey: ['me'], queryFn: () => Promise.resolve(anna) }),
  myProfileOptions: () => ({
    queryKey: ['profile'],
    queryFn: () => Promise.resolve(state.profile),
  }),
}))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.profile = empty
})

afterEach(cleanup)

function view() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ProfileSummary />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return client
}

// docs/specs/0016-public-profile.md, Screens: the account's page.
describe('ProfileSummary', () => {
  it('says that a profile is private, shows the initials and leads to where it is changed', async () => {
    view()

    expect(await screen.findByText('Your profile is private: only you see it.')).toBeTruthy()
    expect(screen.getByText('AN')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Change your profile' }).getAttribute('href')).toBe(
      '/account/profile',
    )
  })

  it('shows the initials of the name as it was just saved on the same page', async () => {
    const client = view()
    expect(await screen.findByText('AN')).toBeTruthy()

    // What saving the name does: the answer goes into the cached account.
    act(() => {
      client.setQueryData(['me'], { ...anna, firstName: 'Zofia', lastName: 'Kowal' })
    })

    expect(await screen.findByText('ZK')).toBeTruthy()
    expect(screen.queryByText('AN')).toBeNull()
  })

  it('says that a profile is public, and shows the avatar', async () => {
    state.profile = { ...empty, published: true, profileId: 'p-1', avatar: { fileId: 'file-1' } }
    view()

    expect(await screen.findByText('Your profile is public: anyone reads it.')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Your avatar' }).getAttribute('src')).toMatch(
      /\/public\/avatar-files\/file-1\/small$/,
    )
  })

  it('says that a profile was taken down', async () => {
    state.profile = {
      ...empty,
      takedown: {
        at: '2026-11-20T10:00:00.000Z',
        reason: 'spam',
        note: null,
        afterReport: false,
        reviewRequested: false,
      },
    }
    view()

    expect(
      await screen.findByText('An administrator took your profile down. See why on its page.'),
    ).toBeTruthy()
  })
})
