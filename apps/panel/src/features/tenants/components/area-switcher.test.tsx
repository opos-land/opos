import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Edition, type Membership, type Tenant } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Api } from '../../../shared/lib/api'
import { SidebarProvider } from '../../../shared/ui'
import { setMemberships, tenantAccess } from '../model/permissions'
import { AreaSwitcher, ConventionSwitcher } from './area-switcher'
import { TenantContext } from './tenant-context'

const edition = (slug: string, name: string): Edition => ({
  id: `edition-${slug}`,
  slug,
  name,
  startsAt: '2026-06-05T08:00:00.000Z',
  endsAt: '2026-06-07T16:00:00.000Z',
  isActive: false,
  isPublished: false,
})

vi.mock('../api/tenants', () => ({
  editionListOptions: () => ({
    queryKey: ['editions'],
    queryFn: () =>
      Promise.resolve([edition('2027', 'Edition 2027'), edition('2026', 'Edition 2026')]),
  }),
}))

const tenant = { id: 'tenant-a', slug: 'convention-a', name: 'Convention A' } as Tenant

const membership = (slug: string, name: string, fields: Partial<Membership> = {}): Membership => ({
  tenant: { id: `tenant-${slug}`, slug, name, suspended: false },
  role: 'org',
  settingsAccess: 'none',
  brandingAccess: 'none',
  shopConfigAccess: 'none',
  expiresAt: null,
  editions: [],
  ...fields,
})

/** An org of convention A with the programme of edition 2026 alone. */
const programOrg = membership('convention-a', 'Convention A', {
  editions: [
    {
      editionId: 'edition-2026',
      editionSlug: '2026',
      programAccess: 'write',
      websiteContentAccess: 'none',
      ticketsAccess: 'none',
    },
  ],
})
const head = membership('convention-a', 'Convention A', { role: 'head' })

const frame = (path: string, node: ReactNode) =>
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <SidebarProvider>
            <Routes>
              <Route path="*" element={node} />
            </Routes>
          </SidebarProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )

/** The switcher of convention A's member, at `path`. */
const inTenant = (path: string, member: Membership) =>
  frame(
    path,
    <TenantContext.Provider
      value={{ tenant, membership: member, access: tenantAccess(member), api: {} as Api }}
    >
      <AreaSwitcher />
    </TenantContext.Provider>,
  )

/**
 * Opens the switcher from its button, named by what it shows: what is open, then what it belongs to,
 * in two lines whose joining space is the browser's.
 */
async function open(name: string | RegExp) {
  await userEvent.click(await screen.findByRole('button', { name }))
  await screen.findByRole('menu')
}

/** The items of a group of the open switcher, each with its address. */
const items = (group: string) =>
  within(screen.getByRole('group', { name: group }))
    .getAllByRole('menuitem')
    .map((item) => [item.textContent, item.getAttribute('href')])

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(() => {
  cleanup()
  setMemberships(null)
})

describe('AreaSwitcher', () => {
  it('names the edition of the page, then its convention', async () => {
    setMemberships([head])
    inTenant('/convention-a/editions/2026/program', head)

    expect(await screen.findByRole('button', { name: /^Edition 2026 ?Convention A$/ })).toBeTruthy()
  })

  it('names the convention settings while they are open', async () => {
    setMemberships([head])
    inTenant('/convention-a/settings/team', head)

    expect(
      await screen.findByRole('button', { name: /^Convention settings ?Convention A$/ }),
    ).toBeTruthy()
  })

  it('offers the editions the member sees, each on its dashboard, and no convention settings to an org without them', async () => {
    setMemberships([programOrg])
    inTenant('/convention-a/editions/2026', programOrg)
    await open(/Edition 2026/)

    expect(items('Editions')).toEqual([['Edition 2026', '/convention-a/editions/2026']])
    expect(screen.queryByRole('menuitem', { name: 'Convention settings' })).toBeNull()
  })

  it('offers every edition and the convention settings to a member who may open them', async () => {
    setMemberships([head])
    inTenant('/convention-a/editions/2026', head)
    await open(/Edition 2026/)

    expect(items('Editions')).toEqual([
      ['Edition 2027', '/convention-a/editions/2027'],
      ['Edition 2026', '/convention-a/editions/2026'],
    ])
    const settings = screen.getByRole('menuitem', { name: 'Convention settings' })
    expect(settings.getAttribute('href')).toBe('/convention-a/settings')
  })

  it('offers the other conventions to a member of several, and none to a member of one', async () => {
    setMemberships([head, membership('convention-b', 'Convention B')])
    inTenant('/convention-a/editions/2026', head)
    await open(/Edition 2026/)

    expect(items('Conventions')).toEqual([['Convention B', '/convention-b']])

    cleanup()
    setMemberships([head])
    inTenant('/convention-a/editions/2026', head)
    await open(/Edition 2026/)

    expect(screen.queryByRole('group', { name: 'Conventions' })).toBeNull()
  })
})

describe('a suspended convention in the switcher', () => {
  it('is marked among the conventions to switch to', async () => {
    setMemberships([
      head,
      membership('convention-b', 'Convention B', {
        tenant: { id: 'tenant-b', slug: 'convention-b', name: 'Convention B', suspended: true },
      }),
    ])
    frame('/account', <ConventionSwitcher />)
    await open(/^OPOS panel ?Choose a convention$/)

    expect(items('Conventions')).toEqual([
      ['Convention A', '/convention-a'],
      ['Convention B (suspended)', '/convention-b'],
    ])
  })
})

describe('ConventionSwitcher', () => {
  it('outside any convention, offers each of the member’s conventions', async () => {
    setMemberships([head, membership('convention-b', 'Convention B')])
    frame('/account', <ConventionSwitcher />)
    await open(/^OPOS panel ?Choose a convention$/)

    expect(items('Conventions')).toEqual([
      ['Convention A', '/convention-a'],
      ['Convention B', '/convention-b'],
    ])
  })
})
