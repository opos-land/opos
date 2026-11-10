import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Member } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { type ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { type SessionState, useSession } from '../../../shared/lib/session'
import { TeamPage } from './team-page'

const list = vi.hoisted(() => vi.fn())
const access = vi.hoisted(() => ({ settings: 'none', isHead: false }))

vi.mock('../../tenants', async () => {
  const { NoPermissionView } = await import('../../../shared/ui')
  const levels = ['none', 'read', 'write']
  return {
    atLeast: (held: string, needed: string) => levels.indexOf(held) >= levels.indexOf(needed),
    RequireAccess: ({ allowed, children }: { allowed: boolean; children: ReactNode }) =>
      allowed ? children : <NoPermissionView />,
    useCurrentTenant: () => ({
      tenant: { slug: 'convention-a', name: 'Convention A' },
      access,
      api: {},
    }),
    useTenantTime: () => ({ timeZone: 'Europe/Warsaw', format: () => '1 Jan 2026' }),
  }
})
vi.mock('../api/members', () => ({
  membersOptions: () => ({ queryKey: ['members'], queryFn: list }),
}))

const account = (id: string, email: string, firstName: string, lastName: string) => ({
  id,
  email,
  firstName,
  lastName,
})
const none = { settingsAccess: 'none', brandingAccess: 'none', shopConfigAccess: 'none' } as const

const head: Member = {
  id: 'm-head',
  account: account('a-head', 'hanna@x.test', 'Hanna', 'Head'),
  role: 'head',
  ...none,
  expiresAt: null,
  expired: false,
}
const self: Member = {
  id: 'm-self',
  account: account('a-self', 'sam@x.test', 'Sam', 'Self'),
  role: 'org',
  ...none,
  settingsAccess: 'write',
  expiresAt: null,
  expired: false,
}
const org: Member = {
  id: 'm-org',
  account: account('a-org', 'tom@x.test', 'Tom', 'Baker'),
  role: 'org',
  ...none,
  settingsAccess: 'read',
  expiresAt: '2026-01-01T00:00:00.000Z',
  expired: true,
}

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/settings/team']}>
          <Routes>
            <Route path="/convention-a/settings/team" element={<TeamPage />} />
            <Route
              path="/convention-a/settings/team/:membershipId"
              element={<p>The member page</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const NO_PERMISSION = /permissions/i
const row = (name: RegExp) => screen.findByRole('row', { name })
const cells = (element: HTMLElement) =>
  within(element)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  list.mockReset()
  list.mockResolvedValue([head, self, org])
  access.isHead = false
  useSession.setState({
    status: 'ready',
    account: { id: 'a-self' } as SessionState['account'],
  })
})

afterEach(cleanup)

describe('TeamPage', () => {
  it('shows no team and asks nothing of the API without settings access', () => {
    access.settings = 'none'
    view()

    expect(screen.getByRole('heading', { name: NO_PERMISSION })).toBeDefined()
    expect(list).not.toHaveBeenCalled()
  })

  it('shows a reader the team as a table, with nothing to change', async () => {
    access.settings = 'read'
    view()

    expect(cells(await row(/Tom Baker/))).toEqual([
      'Organizer',
      'Read',
      'No access',
      '1 Jan 2026expired',
    ])
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Member',
      'Role',
      'Settings',
      'Shop',
      'Access until',
    ])
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(document.title).toBe('Team · Convention A · OPOS panel')
  })

  it('gives a head every permission and no end date', async () => {
    access.settings = 'read'
    view()

    expect(cells(await row(/Hanna Head/))).toEqual([
      'Head organizer',
      'Full access',
      'Full access',
      'No end date',
    ])
  })

  it('marks the own membership', async () => {
    access.settings = 'read'
    view()

    expect(within(await row(/Sam Self/)).getByText('(you)')).toBeDefined()
  })

  it('links a writer to the members it may change and to the invitation', async () => {
    access.settings = 'write'
    view()

    const link = await screen.findByRole('link', { name: 'Tom Baker' })
    expect(link.getAttribute('href')).toBe('/convention-a/settings/team/m-org')
    expect(screen.queryByRole('link', { name: 'Hanna Head' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sam Self' })).toBeNull()
    const invite = screen.getByRole('link', { name: 'Invite to the team' })
    expect(invite.getAttribute('href')).toBe('/convention-a/settings/team/invite')
  })

  it("opens the member's page from anywhere in its row", async () => {
    const user = userEvent.setup()
    access.settings = 'write'
    view()

    await user.click(within(await row(/Tom Baker/)).getByText('Organizer'))

    expect(await screen.findByText('The member page')).toBeDefined()
  })

  it('leaves inert the rows it offers no change to', async () => {
    const user = userEvent.setup()
    access.settings = 'write'
    view()

    await user.click(within(await row(/Sam Self/)).getByText('Organizer'))
    await user.click(within(await row(/Hanna Head/)).getByText('Head organizer'))

    expect(screen.queryByText('The member page')).toBeNull()
    expect(screen.getByRole('table')).toBeDefined()
  })

  it('links a head to another head', async () => {
    access.settings = 'write'
    access.isHead = true
    view()

    const link = await screen.findByRole('link', { name: 'Hanna Head' })
    expect(link.getAttribute('href')).toBe('/convention-a/settings/team/m-head')
  })
})
