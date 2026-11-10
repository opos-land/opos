import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Member } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { type SessionState, useSession } from '../../../shared/lib/session'
import { MemberPage } from './member-page'

const list = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
const remove = vi.hoisted(() => vi.fn())
const access = vi.hoisted(() => ({ settings: 'none', isHead: false }))

vi.mock('../../tenants', async () => {
  const { NoPermissionView } = await import('../../../shared/ui')
  const levels = ['none', 'read', 'write']
  return {
    atLeast: (held: string, needed: string) => levels.indexOf(held) >= levels.indexOf(needed),
    RequireAccess: ({ allowed, children }: { allowed: boolean; children: ReactNode }) =>
      allowed ? children : <NoPermissionView />,
    membershipsKey: () => ['memberships'],
    useCurrentTenant: () => ({
      tenant: { slug: 'convention-a', name: 'Convention A' },
      access,
      api: {},
    }),
    useTenantTime: () => ({
      timeZone: 'Europe/Warsaw',
      format: () => '1 Jan 2027',
      toInput: () => '2027-01-01T01:00',
      fromInput: () => null,
    }),
  }
})
vi.mock('../api/members', () => ({
  membersOptions: () => ({ queryKey: ['members'], queryFn: list }),
  membersKey: () => ['members'],
  updateMemberOptions: () => ({ mutationFn: update }),
  removeMemberOptions: () => ({ mutationFn: remove }),
}))

const none = { settingsAccess: 'none', brandingAccess: 'none', shopConfigAccess: 'none' } as const

const head: Member = {
  id: 'm-head',
  account: { id: 'a-head', email: 'hanna@x.test', firstName: 'Hanna', lastName: 'Head' },
  role: 'head',
  ...none,
  expiresAt: null,
  expired: false,
}
const self: Member = {
  id: 'm-self',
  account: { id: 'a-self', email: 'sam@x.test', firstName: 'Sam', lastName: 'Self' },
  role: 'org',
  ...none,
  settingsAccess: 'write',
  expiresAt: null,
  expired: false,
}
const org: Member = {
  id: 'm-org',
  account: { id: 'a-org', email: 'tom@x.test', firstName: 'Tom', lastName: 'Baker' },
  role: 'org',
  ...none,
  settingsAccess: 'read',
  expiresAt: '2027-01-01T00:00:00.000Z',
  expired: false,
}

const view = (membershipId: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/convention-a/settings/team/${membershipId}`]}>
          <Routes>
            <Route path="/:tenantSlug/settings/team" element={<p>The team table</p>} />
            <Route path="/:tenantSlug/settings/team/:membershipId" element={<MemberPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const NO_PERMISSION = /permissions/i

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  list.mockReset()
  list.mockResolvedValue([head, self, org])
  update.mockReset()
  update.mockResolvedValue(org)
  remove.mockReset()
  remove.mockResolvedValue(undefined)
  access.settings = 'write'
  access.isHead = false
  useSession.setState({
    status: 'ready',
    account: { id: 'a-self' } as SessionState['account'],
  })
})

afterEach(cleanup)

describe('MemberPage', () => {
  it('shows nothing and asks nothing of the API below settings=write', () => {
    access.settings = 'read'
    view('m-org')

    expect(screen.getByRole('heading', { name: NO_PERMISSION })).toBeDefined()
    expect(list).not.toHaveBeenCalled()
  })

  it('says when the team has no such member', async () => {
    view('m-gone')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeDefined()
  })

  it.each([
    ['the own membership', 'm-self'],
    ["a head's membership to an org", 'm-head'],
  ])('offers no change to %s', async (_, membershipId) => {
    view(membershipId)

    expect(await screen.findByRole('heading', { name: NO_PERMISSION })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('names the member in the tab and leads back to the team', async () => {
    view('m-org')

    expect(await screen.findByRole('heading', { name: 'Tom Baker', level: 1 })).toBeDefined()
    expect(document.title).toBe('Tom Baker · Convention A · OPOS panel')
    const back = screen.getByRole('link', { name: 'Back to the team' })
    expect(back.getAttribute('href')).toBe('/convention-a/settings/team')
  })

  it('sends only what changed and returns to the team', async () => {
    const user = userEvent.setup()
    view('m-org')

    await user.selectOptions(await screen.findByLabelText('Shop'), 'read')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('The team table')).toBeDefined()
    expect(update.mock.calls[0]?.[0]).toEqual({
      params: { membershipId: 'm-org' },
      body: { shopConfigAccess: 'read' },
    })
  })

  it('removes the member only once confirmed, then returns to the team', async () => {
    const user = userEvent.setup()
    view('m-org')

    await user.click(await screen.findByRole('button', { name: 'Remove from the team' }))
    expect(remove).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Yes, remove Tom Baker from the team' }))

    expect(await screen.findByText('The team table')).toBeDefined()
    expect(remove.mock.calls[0]?.[0]).toEqual({ params: { membershipId: 'm-org' } })
  })
})
