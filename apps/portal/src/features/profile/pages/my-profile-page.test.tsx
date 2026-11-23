import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type MyProfile } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MyProfilePage } from './my-profile-page'

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

interface PageState {
  profile: MyProfile | undefined
  account: {
    id: string
    email: string
    firstName: string | null
    nickname: string | null
    lastName: string | null
    nameOrder: 'nickname-middle' | 'nickname-last'
  }
}

const state = vi.hoisted((): PageState => ({
  profile: undefined,
  account: {
    id: 'user-anna',
    email: 'anna@example.test',
    firstName: 'Anna',
    nickname: null,
    lastName: 'Nowak',
    nameOrder: 'nickname-middle',
  },
}))

const api = vi.hoisted(() => ({
  update: vi.fn(),
  putAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  publish: vi.fn(),
  withdraw: vi.fn(),
  requestReview: vi.fn(),
}))

vi.mock('../api/profile', () => ({
  // The account as `GET /me` answers it: a name saved on the account's page is in it at once.
  accountOptions: () => ({ queryKey: ['me'], queryFn: () => Promise.resolve(state.account) }),
  myProfileOptions: () => ({
    queryKey: ['profile'],
    queryFn: () => Promise.resolve(state.profile),
  }),
  updateProfileOptions: () => ({ mutationFn: api.update }),
  putAvatarOptions: () => ({ mutationFn: api.putAvatar }),
  removeAvatarOptions: () => ({ mutationFn: api.removeAvatar }),
  publishProfileOptions: () => ({ mutationFn: api.publish }),
  withdrawProfileOptions: () => ({ mutationFn: api.withdraw }),
  requestReviewOptions: () => ({ mutationFn: api.requestReview }),
}))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.profile = empty
  for (const call of Object.values(api)) {
    call.mockReset()
    call.mockImplementation(() => Promise.resolve(state.profile))
  }
})

afterEach(cleanup)

async function openPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/account/profile']}>
          <MyProfilePage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Your profile' })
  return userEvent.setup()
}

const takenDown: MyProfile = {
  ...empty,
  city: 'Gdynia',
  takedown: {
    at: '2026-11-20T10:00:00.000Z',
    reason: 'identity',
    note: 'The picture shows someone else.',
    afterReport: true,
    reviewRequested: false,
  },
}

// docs/specs/0016-public-profile.md, P1-P7.
describe('MyProfilePage: what the profile holds', () => {
  it('shows what the profile holds, with a field for each of its three links and every interest of the list', async () => {
    state.profile = {
      ...empty,
      description: 'Game master.',
      pronouns: 'she/her',
      city: 'Gdynia',
      links: ['https://example.test/me'],
      interests: ['larp'],
    }
    await openPage()

    expect(screen.getByLabelText<HTMLTextAreaElement>('About you').value).toBe('Game master.')
    expect(screen.getByLabelText<HTMLInputElement>('Pronouns').value).toBe('she/her')
    expect(screen.getByLabelText<HTMLInputElement>('City or region').value).toBe('Gdynia')
    expect(screen.getByLabelText<HTMLInputElement>('Link 1').value).toBe('https://example.test/me')
    expect(screen.getByLabelText<HTMLInputElement>('Link 3').value).toBe('')
    const interests = within(screen.getByRole('group', { name: 'Interests' }))
    expect(interests.getAllByRole('checkbox')).toHaveLength(12)
    expect(interests.getByRole('checkbox', { name: 'LARP' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(interests.getByRole('checkbox', { name: 'Cosplay' }).getAttribute('aria-checked')).toBe(
      'false',
    )
  })

  it('saves what was typed, an emptied field as nothing and only the links that were filled in', async () => {
    state.profile = { ...empty, pronouns: 'she/her', interests: ['larp'] }
    const user = await openPage()

    await user.clear(screen.getByLabelText('Pronouns'))
    await user.type(screen.getByLabelText('City or region'), ' Gdynia ')
    await user.type(screen.getByLabelText('Link 2'), 'https://example.test/me')
    await user.click(screen.getByRole('checkbox', { name: 'Cosplay' }))
    await user.click(screen.getByRole('button', { name: 'Save the profile' }))

    await waitFor(() =>
      expect(api.update.mock.lastCall?.[0]).toEqual({
        body: {
          description: null,
          pronouns: null,
          city: 'Gdynia',
          links: ['https://example.test/me'],
          interests: ['larp', 'cosplay'],
        },
      }),
    )
  })

  it('refuses a link that is not an https address and a description over 500 characters, and sends nothing', async () => {
    const user = await openPage()

    await user.type(screen.getByLabelText('Link 1'), 'http://example.test')
    await user.click(screen.getByRole('button', { name: 'Save the profile' }))
    expect(await screen.findByText('Enter an address that starts with https://.')).toBeTruthy()

    await user.clear(screen.getByLabelText('Link 1'))
    await user.click(screen.getByLabelText('About you'))
    await user.paste('x'.repeat(501))
    await user.click(screen.getByRole('button', { name: 'Save the profile' }))
    expect(await screen.findByText('Enter up to 500 characters.')).toBeTruthy()
    expect(api.update).not.toHaveBeenCalled()
  })
})

// P7 and P8.
describe('MyProfilePage: publishing', () => {
  it('says that a profile is private, and publishes it', async () => {
    const user = await openPage()

    expect(screen.getByText('Your profile is private: only you see it.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Publish the profile' }))

    await waitFor(() => expect(api.publish).toHaveBeenCalledOnce())
  })

  it('links the page of a published profile, and withdraws it', async () => {
    state.profile = { ...empty, published: true, profileId: 'p-1' }
    const user = await openPage()

    expect(
      screen.getByRole('link', { name: 'See your profile as everyone does' }).getAttribute('href'),
    ).toBe('/profiles/p-1')
    await user.click(screen.getByRole('button', { name: 'Withdraw the profile' }))

    await waitFor(() => expect(api.withdraw).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'Publish the profile' })).toBeNull()
  })

  // M4: where a profile is published and where an avatar is uploaded.
  it('links the terms where a profile is published and where an avatar is uploaded', async () => {
    await openPage()

    const sections = ['Who sees your profile', 'Avatar'].map((title) =>
      screen.getByRole('region', { name: title }),
    )
    for (const section of sections) {
      const link = within(section).getByRole('link', { name: 'the terms' })
      expect(link.getAttribute('href')).toBe('/terms')
    }
  })
})

// A1, A2, A5 and A7.
describe('MyProfilePage: the avatar', () => {
  const file = (name: string, type: string, size = 10) =>
    new File([new Uint8Array(size)], name, { type })

  it('shows the initials of an account with no avatar, and says who sees an avatar and which picture may be one', async () => {
    await openPage()

    expect(screen.getByText('AN')).toBeTruthy()
    expect(
      screen.getByText(
        'An avatar is public from the moment you upload it, whether or not your profile is published.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(/Upload a picture of yourself, or one you have the right to show/),
    ).toBeTruthy()
  })

  it('uploads the chosen picture', async () => {
    const user = await openPage()

    await user.upload(screen.getByLabelText('Avatar file'), file('me.png', 'image/png'))
    await user.click(screen.getByRole('button', { name: 'Upload the avatar' }))

    await waitFor(() => expect(api.putAvatar).toHaveBeenCalledOnce())
    expect(api.putAvatar.mock.lastCall?.[0]).toMatchObject({
      body: { file: { name: 'me.png', type: 'image/png' } },
    })
  })

  it('tells a file that is no picture and one that is too large before anything is sent', async () => {
    const user = await openPage()
    const input = screen.getByLabelText<HTMLInputElement>('Avatar file')

    await userEvent.setup({ applyAccept: false }).upload(input, file('me.gif', 'image/gif'))
    expect(await screen.findByText('Choose a JPEG, PNG or WebP image.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Upload the avatar' })).toHaveProperty(
      'disabled',
      true,
    )

    await user.upload(input, file('big.png', 'image/png', 5 * 1024 * 1024 + 1))
    expect(await screen.findByText('Choose an image of up to 5 MB.')).toBeTruthy()
    expect(api.putAvatar).not.toHaveBeenCalled()
  })

  it('shows the avatar from its public address, and asks before it is removed', async () => {
    state.profile = { ...empty, avatar: { fileId: 'file-1' } }
    const user = await openPage()

    expect(screen.getByRole('img', { name: 'Your avatar' }).getAttribute('src')).toMatch(
      /\/public\/avatar-files\/file-1\/large$/,
    )
    await user.click(screen.getByRole('button', { name: 'Remove the avatar' }))
    expect(api.removeAvatar).not.toHaveBeenCalled()
    const modal = within(await screen.findByRole('alertdialog'))
    await user.click(modal.getByRole('button', { name: 'Remove the avatar' }))

    await waitFor(() => expect(api.removeAvatar).toHaveBeenCalledOnce())
  })
})

// T5-T7.
describe('MyProfilePage: a profile taken down', () => {
  it('says why, under which rule, that a report came first, what the admin wrote and who decided', async () => {
    state.profile = takenDown
    await openPage()

    const notice = within(screen.getByRole('alert'))
    expect(notice.getByText('An administrator took your profile down')).toBeTruthy()
    expect(
      notice.getByText(
        'It was taken down because the terms of OPOS do not allow a profile to show a picture, a name or an identity of someone else.',
      ),
    ).toBeTruthy()
    expect(
      notice.getByText('The decision followed a report someone sent about your profile.'),
    ).toBeTruthy()
    expect(notice.getByText('The picture shows someone else.')).toBeTruthy()
    expect(
      notice.getByText(
        'The decision was made by a person, an administrator, and not by a program.',
      ),
    ).toBeTruthy()
    expect(notice.getByText(/contact@opos\.land/)).toBeTruthy()
  })

  it('offers no publishing, keeps the fields open and asks for a review', async () => {
    state.profile = takenDown
    const user = await openPage()

    expect(screen.queryByRole('button', { name: 'Publish the profile' })).toBeNull()
    expect(screen.getByLabelText<HTMLInputElement>('City or region').disabled).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Ask for a review' }))

    await waitFor(() => expect(api.requestReview).toHaveBeenCalledOnce())
  })

  it('says that a review was asked for, and asks no second time', async () => {
    state.profile = { ...takenDown, takedown: { ...takenDown.takedown!, reviewRequested: true } }
    await openPage()

    expect(
      screen.getByText('You asked for a review. An administrator will look at your profile.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ask for a review' })).toBeNull()
  })
})
