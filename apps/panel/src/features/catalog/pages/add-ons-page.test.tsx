import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddOnsPage } from './add-ons-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readAddOns = vi.hoisted(() => vi.fn())
const createAddOn = vi.hoisted(() => vi.fn())
const updateAddOn = vi.hoisted(() => vi.fn())
const removeAddOn = vi.hoisted(() => vi.fn())

vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: {
      edition: () => ({ program: 'none', websiteContent: 'none', tickets: state.tickets }),
    },
    api: {},
  }),
}))
vi.mock('../../editions', () => ({
  useEditionBySlug: () => ({
    isPending: false,
    isError: false,
    error: null,
    edition: { id: 'edition-2026', slug: '2026', name: 'Edition 2026' },
  }),
}))
vi.mock('../api/catalog', () => ({
  addOnsOptions: () => ({ queryKey: ['catalog', 'add-ons'], queryFn: readAddOns }),
  createAddOnOptions: () => ({ mutationFn: createAddOn }),
  updateAddOnOptions: () => ({ mutationFn: updateAddOn }),
  removeAddOnOptions: () => ({ mutationFn: removeAddOn }),
  catalogKey: () => ['catalog'],
}))

const addOn = (position: number, fields: object = {}) => ({
  id: `add-on-${position}`,
  editionId: 'edition-2026',
  name: `Add-on ${position}`,
  description: '',
  amountMinor: 0,
  kind: 'unlimited',
  capacity: null,
  placesLeftThreshold: null,
  position,
  hidden: false,
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/add-ons']}>
          <Routes>
            <Route path="/:tenantSlug/editions/:editionSlug/add-ons" element={<AddOnsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

/** The row of the table that holds the add-on of that name. */
const row = (name: string) => screen.getByText(name).closest('tr')!

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  readAddOns.mockResolvedValue([])
  for (const mock of [createAddOn, updateAddOn, removeAddOn]) mock.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the add-ons page', () => {
  it('shows nothing of the catalog to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readAddOns).not.toHaveBeenCalled()
  })

  it('lists the add-ons in their order, each with its price and what limits it', async () => {
    readAddOns.mockResolvedValue([
      addOn(1, { name: 'Sleeping room', kind: 'headcount' }),
      addOn(2, { name: 'Workshop', amountMinor: 4050, kind: 'limited', capacity: 30 }),
      addOn(3, { name: 'Parking', amountMinor: 1500, hidden: true }),
    ])

    view()

    await screen.findByRole('table', { name: 'Add-ons in their order' })
    expect(within(row('Sleeping room')).getByText('Free')).toBeDefined()
    expect(within(row('Sleeping room')).getByText('Headcount only')).toBeDefined()
    expect(within(row('Workshop')).getByText(/40\.50/)).toBeDefined()
    expect(within(row('Workshop')).getByText('Limited places: 30')).toBeDefined()
    expect(within(row('Parking')).getByText('Hidden from the shop')).toBeDefined()
    // A row an add-on, under the row of the headings, in the order of the shop.
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((line) => line.querySelector('td')?.textContent),
    ).toEqual(['Sleeping room', 'Workshop', 'ParkingHidden from the shop'])
  })

  it('opens the page of an add-on from its row, for a member who may change it', async () => {
    readAddOns.mockResolvedValue([addOn(1, { name: 'Workshop' })])
    view()

    const link = await screen.findByRole('link', { name: 'Workshop' })
    expect(link.getAttribute('href')).toBe('/convention-a/editions/2026/add-ons/add-on-1')
    // The list itself holds no form and deletes nothing.
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete the add-on' })).toBeNull()
  })

  it('lets a reader see the add-ons and change nothing', async () => {
    state.tickets = 'read'
    readAddOns.mockResolvedValue([addOn(1)])

    view()

    await screen.findByText('Add-on 1')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText('Name')).toBeNull()
    // No page to open either: the page of an add-on is where it is changed.
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('links a member who may add to the page of a new add-on, and holds no form of one', async () => {
    view()
    await screen.findByText('The edition has no add-ons yet.')

    expect(screen.getByRole('link', { name: 'New add-on' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/add-ons/new',
    )
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('moves an add-on, and offers no step past either end of the list', async () => {
    readAddOns.mockResolvedValue([addOn(1), addOn(2), addOn(3)])
    view()
    await screen.findByText('Add-on 1')

    expect(within(row('Add-on 1')).queryByRole('button', { name: 'Move up' })).toBeNull()
    expect(within(row('Add-on 3')).queryByRole('button', { name: 'Move down' })).toBeNull()
    fireEvent.click(within(row('Add-on 2')).getByRole('button', { name: 'Move down' }))

    await waitFor(() => expect(updateAddOn).toHaveBeenCalledTimes(1))
    expect(updateAddOn.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', addOnId: 'add-on-2' },
      body: { position: 3 },
    })
  })

  it('hides an add-on without asking, and shows a hidden one again', async () => {
    readAddOns.mockResolvedValue([addOn(1), addOn(2, { hidden: true })])
    view()
    await screen.findByText('Add-on 1')

    fireEvent.click(within(row('Add-on 1')).getByRole('button', { name: 'Hide from the shop' }))
    fireEvent.click(within(row('Add-on 2')).getByRole('button', { name: 'Show in the shop' }))

    await waitFor(() => expect(updateAddOn).toHaveBeenCalledTimes(2))
    expect(updateAddOn.mock.calls.map(([call]) => (call as { body: object }).body)).toEqual([
      { hidden: true },
      { hidden: false },
    ])
  })
})
