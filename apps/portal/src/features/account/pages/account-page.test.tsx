import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signOut } from '../../auth'
import { AccountPage } from './account-page'

const me = vi.hoisted(() => ({
  current: {
    id: 'user-anna',
    email: 'anna@example.test',
    firstName: null as string | null,
    lastName: null as string | null,
    nickname: null as string | null,
    nameOrder: 'nickname-middle' as const,
    locale: null,
    theme: null as 'light' | 'dark' | null,
    mfaEnabled: false,
    signInMethods: ['password'] as string[],
  },
}))

const update = vi.hoisted(() => vi.fn((_input: unknown) => Promise.resolve({})))

vi.mock('../../auth', () => ({
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  GoogleButton: () => <button type="button">Confirm with Google</button>,
}))
// The profile's summary has tests of its own.
vi.mock('../../profile', () => ({ ProfileSummary: () => <p>the summary of the profile</p> }))
vi.mock('../api/account', () => ({
  mergeSavedAccount: vi.fn(),
  accountOptions: () => ({ queryKey: ['account'], queryFn: () => Promise.resolve(me.current) }),
  updateAccountOptions: () => ({ mutationFn: update }),
  deleteAccountOptions: () => ({ mutationFn: () => Promise.resolve() }),
  forgetSession: vi.fn(),
}))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  me.current = {
    ...me.current,
    firstName: null,
    lastName: null,
    nickname: null,
    nameOrder: 'nickname-middle',
    theme: null,
    mfaEnabled: false,
    signInMethods: ['password'],
  }
  update.mockClear()
  vi.mocked(signOut).mockReset()
})

afterEach(cleanup)

async function openPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/account']}>
          <AccountPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  await screen.findByText('Signed in as anna@example.test')
  return userEvent.setup()
}

describe('AccountPage sign-out', () => {
  it('shows a failed sign-out, since the session cookies are still set', async () => {
    vi.mocked(signOut).mockResolvedValue(new ORPCError('server.unavailable', { status: 503 }))
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The service is temporarily unavailable. Try again in a moment.',
    )
  })

  it('shows nothing when the sign-out worked', async () => {
    vi.mocked(signOut).mockResolvedValue(null)
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says it ends the session on this device only', async () => {
    await openPage()

    expect(screen.getByText('Signing out ends your session on this device.')).toBeTruthy()
  })
})

// docs/specs/0016-public-profile.md, N1-N4.
describe('AccountPage name', () => {
  const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label)
  const order = () => screen.getByLabelText<HTMLSelectElement>('Where the nickname stands')

  it('offers the three parts of the name and where the nickname stands', async () => {
    me.current = { ...me.current, firstName: 'Anna', nickname: 'Lisek', lastName: 'Nowak' }
    await openPage()

    expect(field('First name').value).toBe('Anna')
    expect(field('Nickname').value).toBe('Lisek')
    expect(field('Last name').value).toBe('Nowak')
    expect(order().value).toBe('nickname-middle')
    expect([...order().options].map((option) => option.textContent)).toEqual([
      'Between the first and the last name',
      'After the first and the last name',
    ])
  })

  it('shows the public name as everyone will read it, while it is typed', async () => {
    me.current = { ...me.current, firstName: 'Anna', lastName: 'Nowak' }
    const user = await openPage()

    expect(screen.getByText('Anna Nowak')).toBeTruthy()
    await user.type(field('Nickname'), 'Lisek')
    expect(screen.getByText('Anna “Lisek” Nowak')).toBeTruthy()
    await user.selectOptions(order(), 'nickname-last')
    expect(screen.getByText('Anna Nowak “Lisek”')).toBeTruthy()
  })

  it('shows an account with no part of a name as Anon', async () => {
    await openPage()

    expect(screen.getByText('Anon')).toBeTruthy()
  })

  it('saves the parts and the order, an emptied part as none', async () => {
    me.current = { ...me.current, firstName: 'Anna', lastName: 'Nowak' }
    const user = await openPage()

    await user.clear(field('Last name'))
    await user.type(field('Nickname'), ' Lisek ')
    await user.selectOptions(order(), 'nickname-last')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(update.mock.lastCall?.[0]).toEqual({
        body: { firstName: 'Anna', nickname: 'Lisek', lastName: null, nameOrder: 'nickname-last' },
      }),
    )
  })

  it('refuses a nickname above 50 characters and sends nothing', async () => {
    const user = await openPage()

    await user.type(field('Nickname'), 'x'.repeat(51))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Enter up to 50 characters.')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('AccountPage profile', () => {
  it('shows the profile in a section of its own, below the name', async () => {
    await openPage()

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.indexOf('Your profile')).toBe(headings.indexOf('Your name') + 1)
    expect(screen.getByText('the summary of the profile')).toBeTruthy()
  })
})

describe('AccountPage theme', () => {
  it('offers the interface theme, the system’s by default', async () => {
    await openPage()

    expect(screen.getByRole('heading', { name: 'Theme' })).toBeTruthy()
    const select = screen.getByLabelText<HTMLSelectElement>('Interface theme')
    expect(select.value).toBe('system')
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "The system's theme",
      'Light',
      'Dark',
    ])
  })

  it('shows the theme GET /me names', async () => {
    me.current = { ...me.current, theme: 'dark' }
    await openPage()

    expect(screen.getByLabelText<HTMLSelectElement>('Interface theme').value).toBe('dark')
  })

  it('saves the chosen theme on the account, and the system’s as no theme', async () => {
    const user = await openPage()
    const select = screen.getByLabelText<HTMLSelectElement>('Interface theme')
    const enabled = () => waitFor(() => expect(select.disabled).toBe(false))

    await user.selectOptions(select, 'light')
    await waitFor(() => expect(update.mock.lastCall?.[0]).toEqual({ body: { theme: 'light' } }))

    await enabled()
    await user.selectOptions(select, 'system')
    await waitFor(() => expect(update.mock.lastCall?.[0]).toEqual({ body: { theme: null } }))
  })
})

describe('AccountPage two-factor authentication', () => {
  it('shows the card off for an account without it', async () => {
    await openPage()

    expect(screen.getByRole('heading', { name: 'Two-factor authentication' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn on two-factor authentication' })).toBeTruthy()
  })

  it('shows the card on for an account with it, as GET /me says', async () => {
    me.current = { ...me.current, mfaEnabled: true }
    await openPage()

    expect(screen.getByRole('button', { name: 'Turn off two-factor authentication' })).toBeTruthy()
  })
})

describe('AccountPage deletion', () => {
  it('confirms an email account with the password alone', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(screen.getByLabelText('Your password')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm with Google' })).toBeNull()
  })

  it('offers the methods GET /me names: Google alone for a Google account', async () => {
    me.current = { ...me.current, signInMethods: ['google'] }
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(screen.queryByLabelText('Your password')).toBeNull()
    expect(screen.getByRole('button', { name: 'Confirm with Google' })).toBeTruthy()
  })
})
