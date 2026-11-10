import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Membership, type Tenant } from '@opos/contract'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Api } from '../../../shared/lib/api'
import { clearForbidden, markForbidden } from '../../../shared/lib/forbidden'
import { SidebarProvider } from '../../../shared/ui'
import { tenantAccess } from '../model/permissions'
import { ConventionLayout } from './convention-layout'
import { TenantContext } from './tenant-context'

// The switcher and the account menu of the sidebar have tests of their own.
vi.mock('./area-switcher', () => ({ AreaSwitcher: () => null }))
vi.mock('../../account', () => ({ NavUser: () => null }))

const tenant = { id: 'tenant-a', slug: 'convention-a', name: 'Convention A' } as Tenant

const membership = (fields: Partial<Membership>): Membership => ({
  tenant: { id: 'tenant-a', slug: 'convention-a', name: 'Convention A' },
  role: 'org',
  settingsAccess: 'none',
  brandingAccess: 'none',
  shopConfigAccess: 'none',
  expiresAt: null,
  editions: [],
  ...fields,
})

const view = (member: Membership) =>
  render(
    <I18nProvider i18n={i18n}>
      <TenantContext.Provider
        value={{ tenant, membership: member, access: tenantAccess(member), api: {} as Api }}
      >
        <MemoryRouter initialEntries={['/convention-a/settings']}>
          <SidebarProvider>
            <Routes>
              <Route path="/:tenantSlug/settings" element={<ConventionLayout />}>
                <Route index element={<p>the general settings</p>} />
              </Route>
            </Routes>
          </SidebarProvider>
        </MemoryRouter>
      </TenantContext.Provider>
    </I18nProvider>,
  )

const menu = () => screen.getByRole('navigation', { name: 'Convention A' })
const links = () =>
  within(menu())
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')])

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(() => {
  cleanup()
  clearForbidden()
})

describe('ConventionLayout', () => {
  it('opens every section of the convention settings to a head, and no section of an edition', () => {
    view(membership({ role: 'head' }))

    expect(within(menu()).getByText('Convention settings')).toBeDefined()
    expect(links()).toEqual([
      ['General', '/convention-a/settings'],
      ['Editions', '/convention-a/settings/editions'],
      ['Team', '/convention-a/settings/team'],
    ])
    expect(screen.getByText('the general settings')).toBeDefined()
  })

  it('shows no menu to an org without settings, and leaves the page to say so', () => {
    view(
      membership({
        editions: [
          {
            editionId: 'edition-1',
            editionSlug: '2026',
            programAccess: 'write',
            websiteContentAccess: 'none',
            ticketsAccess: 'none',
          },
        ],
      }),
    )

    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.getByText('the general settings')).toBeDefined()
  })

  it('opens the convention settings to an org who reads them', () => {
    view(membership({ settingsAccess: 'read' }))

    expect(links().map(([name]) => name)).toEqual(['General', 'Editions', 'Team'])
  })

  it('keeps the menu while a 403 replaces the page', () => {
    markForbidden()
    view(membership({ role: 'head' }))

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByText('the general settings')).toBeNull()
    expect(links()).toHaveLength(3)
  })
})
