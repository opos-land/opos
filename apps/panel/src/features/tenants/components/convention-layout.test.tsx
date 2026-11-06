import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Membership, type Tenant } from '@opos/contract'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { type Api } from '../../../shared/lib/api'
import { clearForbidden, markForbidden } from '../../../shared/lib/forbidden'
import { tenantAccess } from '../model/permissions'
import { ConventionLayout } from './convention-layout'
import { TenantContext } from './tenant-context'

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
        <MemoryRouter initialEntries={['/convention-a']}>
          <Routes>
            <Route path="/:tenantSlug" element={<ConventionLayout />}>
              <Route index element={<p>the dashboard</p>} />
            </Route>
          </Routes>
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
  it('opens every convention section to a head, and no section of an edition', () => {
    view(membership({ role: 'head' }))

    expect(links()).toEqual([
      ['Dashboard', '/convention-a'],
      ['Editions', '/convention-a/editions'],
      ['Team', '/convention-a/team'],
      ['Settings', '/convention-a/settings'],
    ])
    expect(screen.getByText('the dashboard')).toBeDefined()
  })

  it('hides the team and the settings from an org without settings', () => {
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

    expect(links().map(([name]) => name)).toEqual(['Dashboard', 'Editions'])
  })

  it('shows the team and the settings to an org who reads the settings', () => {
    view(membership({ settingsAccess: 'read' }))

    expect(links().map(([name]) => name)).toEqual(['Dashboard', 'Editions', 'Team', 'Settings'])
  })

  it('keeps the menu while a 403 replaces the page', () => {
    markForbidden()
    view(membership({ role: 'head' }))

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByText('the dashboard')).toBeNull()
    expect(links()).toHaveLength(4)
  })
})
