import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketTypesPage } from './ticket-types-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readTypes = vi.hoisted(() => vi.fn())
const updateType = vi.hoisted(() => vi.fn())

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
  useTenantTime: () => ({ range: (from: string, to: string) => `${from} to ${to}` }),
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
  ticketTypesOptions: () => ({ queryKey: ['catalog', 'ticket-types'], queryFn: readTypes }),
  updateTicketTypeOptions: () => ({ mutationFn: updateType }),
  catalogKey: () => ['catalog'],
}))

const always = { startsAt: '2000-01-01T00:00:00.000Z', endsAt: '2100-01-01T00:00:00.000Z' }
const ticketType = (position: number, fields: object = {}) => ({
  id: `type-${position}`,
  editionId: 'edition-2026',
  name: `Type ${position}`,
  shortDescription: '',
  longDescription: '',
  capacity: null,
  saleStartsAt: '2027-01-01T08:00:00.000Z',
  saleEndsAt: '2027-06-01T08:00:00.000Z',
  ageBands: ['adult'],
  discountsExcluded: false,
  shownOutsideSaleWindow: false,
  position,
  hidden: false,
  tiers: [{ amountMinor: 12050, ...always }],
  supporterPrices: [],
  perks: [],
  addOnIds: [],
  merchandiseItemIds: [],
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/ticket-types']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/ticket-types"
              element={<TicketTypesPage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr')!

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  readTypes.mockResolvedValue([])
  updateType.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the ticket types page', () => {
  it('shows nothing to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readTypes).not.toHaveBeenCalled()
  })

  it('says so while the edition has none', async () => {
    view()

    expect(await screen.findByText('The edition has no ticket types yet.')).toBeDefined()
  })

  it('lists each with the price in force now, its sale window and its capacity', async () => {
    readTypes.mockResolvedValue([
      ticketType(1, { name: 'Standard', capacity: 800 }),
      ticketType(2, { name: 'Supporter', discountsExcluded: true, hidden: true }),
      ticketType(3, { name: 'Late', tiers: [] }),
    ])

    view()

    const standard = within(await waitFor(() => rowOf('Standard')))
    expect(standard.getByText(/120\.50/)).toBeDefined()
    expect(standard.getByText('800')).toBeDefined()
    expect(standard.getByText('2027-01-01T08:00:00.000Z to 2027-06-01T08:00:00.000Z')).toBeDefined()
    const supporter = within(rowOf('Supporter'))
    expect(supporter.getByText('Excluded from discounts')).toBeDefined()
    expect(supporter.getByText('Hidden from the shop')).toBeDefined()
    expect(supporter.getByText('No limit')).toBeDefined()
    expect(within(rowOf('Late')).getByText('No price in force')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Standard' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/ticket-types/type-1',
    )
  })

  it('leads a writer to a new ticket type, and a reader nowhere', async () => {
    readTypes.mockResolvedValue([ticketType(1)])
    view()
    expect(
      (await screen.findByRole('link', { name: 'New ticket type' })).getAttribute('href'),
    ).toBe('/convention-a/editions/2026/ticket-types/new')
    cleanup()

    state.tickets = 'read'
    view()
    await waitFor(() => rowOf('Type 1'))
    expect(screen.queryByRole('link', { name: 'New ticket type' })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('moves a ticket type and hides it from the list itself', async () => {
    readTypes.mockResolvedValue([ticketType(1), ticketType(2)])
    view()
    const first = within(await waitFor(() => rowOf('Type 1')))

    expect(first.queryByRole('button', { name: 'Move up' })).toBeNull()
    fireEvent.click(first.getByRole('button', { name: 'Move down' }))
    fireEvent.click(first.getByRole('button', { name: 'Hide from the shop' }))

    await waitFor(() => expect(updateType).toHaveBeenCalledTimes(2))
    expect(updateType.mock.calls.map(([call]) => call as object)).toEqual([
      { params: { editionId: 'edition-2026', ticketTypeId: 'type-1' }, body: { position: 2 } },
      { params: { editionId: 'edition-2026', ticketTypeId: 'type-1' }, body: { hidden: true } },
    ])
  })
})
