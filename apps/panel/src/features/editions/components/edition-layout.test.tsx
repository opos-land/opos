import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Edition } from '@opos/contract'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '../../../shared/ui'
import type * as Tenants from '../../tenants'
import { EditionLayout } from './edition-layout'

const state = vi.hoisted(() => ({
  editions: [] as Edition[],
  settings: 'none',
  program: 'none',
  tickets: 'none',
}))

vi.mock('../hooks/use-editions', () => ({
  useEditions: () => ({ data: state.editions, isPending: false, isError: false, error: null }),
  useEditionBySlug: (slug: string | undefined) => ({
    data: state.editions,
    isPending: false,
    isError: false,
    error: null,
    edition: state.editions.find((edition) => edition.slug === slug),
  }),
}))
vi.mock('../../tenants', async (importOriginal) => ({
  ...(await importOriginal<typeof Tenants>()),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: {
      isHead: false,
      settings: state.settings,
      shop: 'none',
      edition: () => ({
        program: state.program,
        websiteContent: 'none',
        tickets: state.tickets,
      }),
      seesEdition: () => true,
    },
    api: {},
  }),
}))

// The switcher and the account menu of the sidebar have tests of their own.
vi.mock('../../tenants/components/area-switcher', () => ({ AreaSwitcher: () => null }))
vi.mock('../../account', () => ({ NavUser: () => null }))

const edition = (slug: string, name: string): Edition => ({
  id: `edition-${slug}`,
  slug,
  name,
  startsAt: '2026-06-05T08:00:00.000Z',
  endsAt: '2026-06-07T16:00:00.000Z',
  isActive: false,
  isPublished: false,
  venueName: null,
  venueAddress: null,
  venueCity: null,
})

const view = (path: string) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <SidebarProvider>
          <Routes>
            <Route path="/:tenantSlug/editions/:editionSlug" element={<EditionLayout />}>
              <Route index element={<p>the edition dashboard</p>} />
              <Route path="program" element={<p>the programme</p>} />
              <Route path="*" element={<p>another page of the edition</p>} />
            </Route>
          </Routes>
        </SidebarProvider>
      </MemoryRouter>
    </I18nProvider>,
  )

/** The links the menu shows, by name, each with its address: a closed folder shows none of its own. */
const links = (menuName: string) => {
  const menu = screen.getByRole('navigation', { name: menuName })
  return within(menu)
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')])
}

/** The folders of the menu, by name, each with whether it is open. */
const folders = (menuName: string) => {
  const menu = screen.getByRole('navigation', { name: menuName })
  return within(menu)
    .queryAllByRole('button')
    .map((folder) => [folder.textContent, folder.getAttribute('aria-expanded') === 'true'])
}

const openFolder = (menuName: string, folder: string) => {
  const menu = screen.getByRole('navigation', { name: menuName })
  return userEvent.setup().click(within(menu).getByRole('button', { name: folder }))
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.editions = [edition('2027', 'Edition 2027'), edition('2026', 'Edition 2026')]
  state.settings = 'none'
  state.program = 'none'
  state.tickets = 'none'
})

afterEach(cleanup)

describe('EditionLayout', () => {
  it('opens every section of the edition to a member with settings and programme', () => {
    state.settings = 'write'
    state.program = 'write'
    view('/convention-a/editions/2026')

    expect(links('Edition 2026')).toEqual([
      ['Dashboard', '/convention-a/editions/2026'],
      ['Programme', '/convention-a/editions/2026/program'],
      ['Access', '/convention-a/editions/2026/access'],
      ['Edition settings', '/convention-a/editions/2026/settings'],
    ])
    expect(screen.getByText('the edition dashboard')).toBeDefined()
    expect(screen.queryByRole('navigation', { name: 'Convention A' })).toBeNull()
  })

  it('shows an org who reads the tickets of the edition what was sold, and folds away what the shop sells and asks', () => {
    state.tickets = 'read'
    view('/convention-a/editions/2026')

    expect(links('Edition 2026')).toEqual([
      ['Dashboard', '/convention-a/editions/2026'],
      ['Orders', '/convention-a/editions/2026/orders'],
      ['Sales', '/convention-a/editions/2026/sales'],
      ['Scanners', '/convention-a/editions/2026/scanners'],
    ])
    expect(folders('Edition 2026')).toEqual([
      ['Offer', false],
      ['Shop setup', false],
    ])
  })

  it('holds what the edition sells in the folder of the offer', async () => {
    state.tickets = 'read'
    view('/convention-a/editions/2026')

    await openFolder('Edition 2026', 'Offer')

    expect(links('Edition 2026').slice(4)).toEqual([
      ['Ticket types', '/convention-a/editions/2026/ticket-types'],
      ['Add-ons', '/convention-a/editions/2026/add-ons'],
      ['Merchandise', '/convention-a/editions/2026/merchandise'],
      ['Discount codes', '/convention-a/editions/2026/discount-codes'],
    ])
  })

  it('holds the shop, what it asks of a ticket holder and its documents in the folder of the shop setup', async () => {
    state.tickets = 'read'
    view('/convention-a/editions/2026')

    await openFolder('Edition 2026', 'Shop setup')

    expect(links('Edition 2026').slice(4)).toEqual([
      ['Shop', '/convention-a/editions/2026/shop'],
      ['Ticket holders’ data', '/convention-a/editions/2026/ticket-holders'],
      ['Documents and consents', '/convention-a/editions/2026/documents'],
    ])
  })

  it('opens the folder of the page the member is on, and marks the page in it', () => {
    state.tickets = 'read'
    view('/convention-a/editions/2026/merchandise/shirt')

    expect(screen.getByText('another page of the edition')).toBeDefined()
    expect(folders('Edition 2026')).toEqual([
      ['Offer', true],
      ['Shop setup', false],
    ])
    const menu = screen.getByRole('navigation', { name: 'Edition 2026' })
    expect(
      within(menu).getByRole('link', { name: 'Merchandise' }).getAttribute('aria-current'),
    ).toBe('page')
  })

  it('keeps the folders of the tickets from an org without them', () => {
    state.settings = 'write'
    state.program = 'write'
    view('/convention-a/editions/2026')

    expect(folders('Edition 2026')).toEqual([])
  })

  it('shows an org with the programme alone only the dashboard and the programme', () => {
    state.program = 'write'
    view('/convention-a/editions/2026/program')

    expect(links('Edition 2026').map(([name]) => name)).toEqual(['Dashboard', 'Programme'])
    expect(screen.getByText('the programme')).toBeDefined()
  })

  it('shows the access and the settings to an org who reads the settings', () => {
    state.settings = 'read'
    view('/convention-a/editions/2026')

    expect(links('Edition 2026').map(([name]) => name)).toEqual([
      'Dashboard',
      'Access',
      'Edition settings',
    ])
  })

  it('names its edition at the head of the menu, and leaves the switch to the area switcher', () => {
    view('/convention-a/editions/2026')

    const menu = screen.getByRole('navigation', { name: 'Edition 2026' })
    expect(within(menu).getByText('Edition 2026')).toBeDefined()
    expect(within(menu).queryByRole('button')).toBeNull()
  })

  it('marks the section of the page in the menu', () => {
    state.program = 'write'
    view('/convention-a/editions/2026/program')

    const menu = screen.getByRole('navigation', { name: 'Edition 2026' })
    expect(within(menu).getByRole('link', { name: 'Programme' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(
      within(menu).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current'),
    ).toBeNull()
  })

  it('shows no menu for an edition the member does not see, and leaves the page to say so', () => {
    view('/convention-a/editions/elsewhere')

    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.getByText('the edition dashboard')).toBeDefined()
  })
})
