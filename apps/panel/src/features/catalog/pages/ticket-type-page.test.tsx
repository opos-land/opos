import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketTypePage } from './ticket-type-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readTypes = vi.hoisted(() => vi.fn())
const readAddOns = vi.hoisted(() => vi.fn())
const readItems = vi.hoisted(() => vi.fn())
const createType = vi.hoisted(() => vi.fn())
const updateType = vi.hoisted(() => vi.fn())
const removeType = vi.hoisted(() => vi.fn())

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
  // The wall-clock times of UTC, so that a field holds the start of the instant's own text.
  useTenantTime: () => ({
    timeZone: 'UTC',
    toInput: (iso: string) => iso.slice(0, 16),
    fromInput: (value: string) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00.000Z` : null,
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
  ticketTypesOptions: () => ({ queryKey: ['catalog', 'ticket-types'], queryFn: readTypes }),
  addOnsOptions: () => ({ queryKey: ['catalog', 'add-ons'], queryFn: readAddOns }),
  merchandiseOptions: () => ({ queryKey: ['catalog', 'merchandise'], queryFn: readItems }),
  createTicketTypeOptions: () => ({ mutationFn: createType }),
  updateTicketTypeOptions: () => ({ mutationFn: updateType }),
  removeTicketTypeOptions: () => ({ mutationFn: removeType }),
  catalogKey: () => ['catalog'],
}))

const standard = {
  id: 'type-1',
  editionId: 'edition-2026',
  name: 'Standard',
  shortDescription: 'Three days.',
  longDescription: '',
  capacity: 800,
  saleStartsAt: '2027-01-01T08:00:00.000Z',
  saleEndsAt: '2027-06-01T08:00:00.000Z',
  ageBands: ['teen', 'adult'],
  discountsExcluded: false,
  shownOutsideSaleWindow: false,
  position: 1,
  hidden: false,
  tiers: [
    {
      amountMinor: 12000,
      startsAt: '2027-01-01T08:00:00.000Z',
      endsAt: '2027-03-01T08:00:00.000Z',
    },
  ],
  supporterPrices: [20000],
  perks: ['A pin'],
  addOnIds: ['room'],
  merchandiseItemIds: [],
}

const view = (path = 'new') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/convention-a/editions/2026/ticket-types/${path}`]}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/ticket-types/new"
              element={<TicketTypePage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/ticket-types/:ticketTypeId"
              element={<TicketTypePage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/ticket-types"
              element={<p>the list of ticket types</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const field = (label: string | RegExp) => screen.getByLabelText<HTMLInputElement>(label)
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(field(label), { target: { value } })
const box = (name: string) => screen.getByRole('checkbox', { name })
const ticked = (name: string) => box(name).getAttribute('aria-checked') === 'true'

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  readTypes.mockResolvedValue([standard])
  readAddOns.mockResolvedValue([
    { id: 'room', name: 'Sleeping room' },
    { id: 'workshop', name: 'Workshop' },
  ])
  readItems.mockResolvedValue([{ id: 'shirt', name: 'T-shirt' }])
  createType.mockResolvedValue({ ...standard, id: 'type-9', name: 'Supporter' })
  updateType.mockResolvedValue(standard)
  removeType.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('a new ticket type', () => {
  it('is not offered to a member who only reads the tickets', async () => {
    state.tickets = 'read'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
  })

  it('starts with every age band allowed and nothing else set', async () => {
    view()

    await screen.findByLabelText('Name')
    expect(['Child', 'Teen', 'Adult'].map(ticked)).toEqual([true, true, true])
    expect(field('Name').value).toBe('')
    expect(screen.queryByLabelText(/^Price/)).toBeNull()
  })

  it('is added with its sale window, a tier, a supporter price, a perk and what it offers', async () => {
    view()
    await screen.findByLabelText('Name')

    type('Name', ' Supporter ')
    type('Sale starts', '2027-01-01T10:00')
    type('Sale ends', '2027-06-01T10:00')
    type('Capacity', '100')
    fireEvent.click(box('Child'))
    fireEvent.click(screen.getByRole('button', { name: 'Add a price tier' }))
    type(/^Price \(/, '400')
    type('From', '2027-01-01T10:00')
    type('Until', '2027-06-01T10:00')
    fireEvent.click(screen.getByRole('button', { name: 'Add a supporter price' }))
    type(/^Supporter price 1/, '600,50')
    fireEvent.click(screen.getByRole('button', { name: 'Add a perk' }))
    type('Perk 1', 'A supporter pin')
    fireEvent.click(box('Excluded from discounts'))
    fireEvent.click(box('Workshop'))
    fireEvent.click(box('T-shirt'))
    fireEvent.click(screen.getByRole('button', { name: 'Add the ticket type' }))

    await waitFor(() => expect(createType).toHaveBeenCalledTimes(1))
    expect(createType.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026' },
      body: {
        name: 'Supporter',
        shortDescription: '',
        longDescription: '',
        capacity: 100,
        saleStartsAt: '2027-01-01T10:00:00.000Z',
        saleEndsAt: '2027-06-01T10:00:00.000Z',
        ageBands: ['teen', 'adult'],
        discountsExcluded: true,
        shownOutsideSaleWindow: false,
        tiers: [
          {
            amountMinor: 40000,
            startsAt: '2027-01-01T10:00:00.000Z',
            endsAt: '2027-06-01T10:00:00.000Z',
          },
        ],
        supporterPrices: [60050],
        perks: ['A supporter pin'],
        addOnIds: ['workshop'],
        merchandiseItemIds: ['shirt'],
      },
    })
  })

  it('names what is wrong where it is, and sends nothing', async () => {
    view()
    await screen.findByLabelText('Name')

    for (const name of ['Child', 'Teen', 'Adult']) fireEvent.click(box(name))
    fireEvent.click(screen.getByRole('button', { name: 'Add a price tier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add the ticket type' }))

    expect(await screen.findByText('Enter a name.')).toBeDefined()
    expect(screen.getByText(/Enter when the sale starts and when it ends/)).toBeDefined()
    expect(screen.getByText('Allow at least one age band.')).toBeDefined()
    expect(screen.getByText(/Give every tier a price and both moments/)).toBeDefined()
    expect(createType).not.toHaveBeenCalled()
  })

  it('refuses tiers that overlap before they are sent', async () => {
    view()
    await screen.findByLabelText('Name')
    type('Name', 'Standard')
    type('Sale starts', '2027-01-01T10:00')
    type('Sale ends', '2027-06-01T10:00')

    for (const [from, until] of [
      ['2027-01-01T10:00', '2027-03-01T10:00'],
      ['2027-02-01T10:00', '2027-04-01T10:00'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: 'Add a price tier' }))
      const tier = within(screen.getAllByRole('group', { name: /^Price tier \d$/ }).at(-1)!)
      fireEvent.change(tier.getByLabelText(/^Price/), { target: { value: '100' } })
      fireEvent.change(tier.getByLabelText('From'), { target: { value: from } })
      fireEvent.change(tier.getByLabelText('Until'), { target: { value: until } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Add the ticket type' }))

    expect(await screen.findByText(/Two tiers cover the same time/)).toBeDefined()
    expect(createType).not.toHaveBeenCalled()
  })
})

describe('a ticket type that exists', () => {
  it('fills the form with what it holds', async () => {
    view('type-1')

    await waitFor(() => expect(field('Name').value).toBe('Standard'))
    expect(field('Sale starts').value).toBe('2027-01-01T08:00')
    expect(field('Capacity').value).toBe('800')
    expect(['Child', 'Teen', 'Adult'].map(ticked)).toEqual([false, true, true])
    expect(field(/^Price \(/).value).toBe('120.00')
    expect(field(/^Supporter price 1/).value).toBe('200.00')
    expect(field('Perk 1').value).toBe('A pin')
    expect(['Sleeping room', 'Workshop', 'T-shirt'].map(ticked)).toEqual([true, false, false])
  })

  it('is saved with its lists as they stand in the form', async () => {
    view('type-1')
    await waitFor(() => expect(field('Name').value).toBe('Standard'))

    type('Name', 'Regular')
    fireEvent.click(screen.getByRole('button', { name: 'Remove perk 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove price tier 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save the ticket type' }))

    await waitFor(() => expect(updateType).toHaveBeenCalledTimes(1))
    expect(updateType.mock.calls[0]![0]).toMatchObject({
      params: { editionId: 'edition-2026', ticketTypeId: 'type-1' },
      body: {
        name: 'Regular',
        capacity: 800,
        ageBands: ['teen', 'adult'],
        tiers: [],
        supporterPrices: [20000],
        perks: [],
        addOnIds: ['room'],
      },
    })
  })

  it('is deleted only once the modal that names it is confirmed', async () => {
    view('type-1')

    fireEvent.click(await screen.findByRole('button', { name: 'Delete the ticket type' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete the ticket type “Standard”?')).toBeDefined()
    expect(removeType).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the ticket type' }))

    await waitFor(() => expect(removeType).toHaveBeenCalledTimes(1))
    expect(removeType.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', ticketTypeId: 'type-1' },
    })
    expect(await screen.findByText('the list of ticket types')).toBeDefined()
  })

  it('is shown to a reader with every field disabled and nothing to press', async () => {
    state.tickets = 'read'

    view('type-1')

    await waitFor(() => expect(field('Name').value).toBe('Standard'))
    expect(field('Name').matches(':disabled')).toBe(true)
    expect(field(/^Price \(/).matches(':disabled')).toBe(true)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is not found under an identifier the edition does not hold', async () => {
    view('type-404')

    expect(await screen.findByRole('heading', { name: /not found/i })).toBeDefined()
  })
})
