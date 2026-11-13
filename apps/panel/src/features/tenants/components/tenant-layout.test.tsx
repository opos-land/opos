import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Membership } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider, TooltipProvider } from '../../../shared/ui'
import { setMemberships } from '../model/permissions'
import { TenantLayout } from './tenant-layout'

const load = vi.fn<() => Promise<unknown>>()

vi.mock('../api/tenants', () => ({
  tenantOptions: () => ({
    queryKey: ['tenant', 'convention-a', 'current'],
    queryFn: () => load(),
    retry: false,
  }),
  editionListOptions: () => ({
    queryKey: ['tenant', 'convention-a', 'editions'],
    queryFn: () => [],
  }),
  membershipsKey: () => ['account', 'me', 'memberships'],
}))
// The account menu of the frame has tests of its own.
vi.mock('../../account', () => ({ NavUser: () => null }))

const membership = (suspended: boolean): Membership => ({
  tenant: { id: 'tenant-a', slug: 'convention-a', name: 'Convention A', suspended },
  role: 'head',
  settingsAccess: 'none',
  brandingAccess: 'none',
  shopConfigAccess: 'none',
  expiresAt: null,
  editions: [],
})

const tenant = {
  id: 'tenant-a',
  slug: 'convention-a',
  name: 'Convention A',
  defaultLocale: 'pl',
  timezone: 'Europe/Warsaw',
}

const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/convention-a/settings']}>
          <TooltipProvider>
            <SidebarProvider>
              <Routes>
                <Route path="/:tenantSlug" element={<TenantLayout />}>
                  <Route path="settings" element={<p>the settings of the convention</p>} />
                </Route>
              </Routes>
            </SidebarProvider>
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  load.mockReset()
})

afterEach(() => {
  cleanup()
  setMemberships(null)
})

describe('TenantLayout', () => {
  it('opens the pages of a convention the member is in', async () => {
    setMemberships([membership(false)])
    load.mockResolvedValue(tenant)
    view()

    expect(await screen.findByText('the settings of the convention')).toBeDefined()
  })

  // Suspended by the admin (docs/PRODUCT.md, Business model): its organizers see that and nothing
  // of the convention, and the API is not even asked.
  it('shows only that a suspended convention is suspended, asking the API nothing', async () => {
    setMemberships([membership(true)])
    view()

    expect(
      await screen.findByRole('heading', { name: 'This convention is suspended' }),
    ).toBeDefined()
    expect(screen.getByText(/Contact the OPOS administrators/)).toBeDefined()
    expect(screen.queryByText('the settings of the convention')).toBeNull()
    expect(load).not.toHaveBeenCalled()
    expect(document.title).toBe('This convention is suspended · OPOS panel')
  })

  it('shows the same when the convention was suspended since the memberships were read', async () => {
    setMemberships([membership(false)])
    load.mockRejectedValue(new ORPCError('tenant.suspended', { status: 403 }))
    view()

    expect(
      await screen.findByRole('heading', { name: 'This convention is suspended' }),
    ).toBeDefined()
    expect(screen.queryByText('the settings of the convention')).toBeNull()
  })

  it('still answers an account outside the team with "no permissions"', async () => {
    setMemberships([])
    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(load).not.toHaveBeenCalled()
  })
})
