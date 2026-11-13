import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { signOut } from '../../auth'
import { AdminFrame, AdminNavigation } from './admin-frame'

// The theme toggle has tests of its own.
vi.mock('../../theme', () => ({ ThemeToggle: () => null }))
vi.mock('../../auth', () => ({ signOut: vi.fn() }))

const account = {
  id: 'a',
  email: 'ada@example.test',
  firstName: 'Ada',
  lastName: null,
  locale: null,
  theme: null,
  mfaEnabled: true,
}

const renderFrame = (path = '/') =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <AdminFrame>
          <AdminNavigation />
          <p>a screen</p>
        </AdminFrame>
      </MemoryRouter>
    </I18nProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  useSession.setState({ status: 'ready', account })
  vi.mocked(signOut).mockReset()
})

afterEach(cleanup)

describe('AdminFrame', () => {
  it('names the application and the signed-in account around the screen', () => {
    renderFrame()

    expect(screen.getByText('OPOS administration')).toBeTruthy()
    expect(screen.getByText('ada@example.test')).toBeTruthy()
    expect(screen.getByText('a screen')).toBeTruthy()
  })

  it('signs out on request', async () => {
    vi.mocked(signOut).mockResolvedValue(null)
    renderFrame()

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows why a sign-out failed and stays', async () => {
    vi.mocked(signOut).mockResolvedValue(new ORPCError('server.unavailable', { status: 503 }))
    renderFrame()

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('a screen')).toBeTruthy()
  })
})

describe('AdminNavigation', () => {
  const current = () =>
    screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent)

  it('leads to the conventions, the two-factor reset and the log', () => {
    renderFrame('/')

    expect(
      screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Conventions', '/'],
      ['Two-factor reset', '/two-factor-reset'],
      ['Log', '/log'],
    ])
  })

  it.each([
    ['/', 'Conventions'],
    ['/conventions/new', 'Conventions'],
    ['/conventions/00000000-0000-4000-8000-00000000000a', 'Conventions'],
    ['/two-factor-reset', 'Two-factor reset'],
    ['/log', 'Log'],
  ])('marks the screen the admin is on at %s', (path, label) => {
    renderFrame(path)

    expect(current()).toEqual([label])
  })

  it('marks nothing on a page that is not found', () => {
    renderFrame('/nowhere')

    expect(current()).toEqual([])
  })
})
