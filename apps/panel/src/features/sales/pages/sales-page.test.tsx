import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as SaveFile from '../../../shared/lib/save-file'
import { SalesPage } from './sales-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readSales = vi.hoisted(() => vi.fn())
const readFile = vi.hoisted(() => vi.fn())
const saved = vi.hoisted(() => ({ files: [] as { name: string; body: Blob }[] }))

vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A', timezone: 'Europe/Warsaw' },
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
vi.mock('../../catalog', () => ({
  useMoney: () => ({
    format: (minor: number) => `${(minor / 100).toFixed(2)} PLN`,
    short: (minor: number) => `${Math.round(minor / 100)} PLN`,
  }),
}))
vi.mock('../api/sales', () => ({
  salesOptions: () => ({ queryKey: ['sales'], queryFn: readSales }),
  exportOptions: (_: unknown, __: string, list: string) => ({
    queryKey: ['sales', 'file', list],
    queryFn: () => readFile(list) as unknown,
  }),
}))
vi.mock('../../../shared/lib/save-file', async (original) => ({
  ...(await original<typeof SaveFile>()),
  saveFile: (name: string, body: Blob) => saved.files.push({ name, body }),
}))

const sales = (changes: object = {}) => ({
  currency: 'PLN',
  revenue: { paidMinor: 25000, manualMinor: 7000 },
  orders: { paid: 2, manual: 1, awaitingPayment: 1, needsReview: 3 },
  ticketTypes: [{ id: 'standard', name: 'Standard', sold: 3, pending: 2 }],
  addOns: [
    { id: 'workshop', name: 'Workshop', kind: 'limited', sold: 1, pending: 1 },
    { id: 'room', name: 'Sleeping room', kind: 'headcount', sold: 2, pending: 0 },
  ],
  items: [
    {
      id: 'shirt',
      name: 'T-shirt',
      variants: [
        { id: 'shirt-m', labels: ['Men’s', 'M'], sold: 4, pending: 0 },
        { id: 'shirt-l', labels: ['Men’s', 'L'], sold: 0, pending: 1 },
      ],
    },
  ],
  days: [
    { day: '2027-03-02', paidMinor: 25000, manualMinor: 0, tickets: 2 },
    { day: '2027-03-04', paidMinor: 3000, manualMinor: 7000, tickets: 1 },
  ],
  ageBands: { child: 0, teen: 1, adult: 2 },
  customFields: [
    {
      id: 'city',
      label: 'City',
      answers: [
        { answer: 'Poznań', orders: 2 },
        { answer: 'Gdynia', orders: 1 },
      ],
    },
  ],
  ...changes,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/sales']}>
          <Routes>
            <Route path="/:tenantSlug/editions/:editionSlug/sales" element={<SalesPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const section = async (name: string) =>
  within((await screen.findByRole('heading', { name, level: 2 })).closest('section')!)
type Scope = Awaited<ReturnType<typeof section>>
const row = (scope: Scope, name: string | RegExp) =>
  within(scope.getByRole('rowheader', { name }).closest('tr')!)

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'read'
  saved.files = []
  readSales.mockResolvedValue(sales())
  readFile.mockImplementation((list: string) =>
    Promise.resolve({
      headers: { 'content-disposition': `attachment; filename="${list}-2026.csv"` },
      body: new Blob(['file']),
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// docs/specs/0010-sales-reports.md, Screens: the dashboard, and the three exports.
describe('the sales page', () => {
  it('shows nothing of the sales to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readSales).not.toHaveBeenCalled()
  })

  // D4: what went through the provider apart from what an org recorded.
  it('shows the revenue of the paid orders apart from the manual ones, and what is still open', async () => {
    view()

    const revenue = await section('Revenue')
    expect(row(revenue, 'Paid in the shop').getByText('250.00 PLN')).toBeDefined()
    expect(row(revenue, 'Paid in the shop').getByText('2')).toBeDefined()
    expect(row(revenue, 'Recorded by organizers').getByText('70.00 PLN')).toBeDefined()
    expect(row(revenue, 'Awaiting payment').getByText('1')).toBeDefined()
    expect(row(revenue, 'Needs review').getByText('3')).toBeDefined()
  })

  // D1 and D3: sold apart from pending, of every ticket type, add-on and variant.
  it('counts what is sold apart from what is pending', async () => {
    view()

    const tickets = await section('Tickets')
    expect(
      row(tickets, 'Standard')
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['3', '2'])
    const addOns = await section('Add-ons')
    // A headcount-only add-on is counted like any other, and told apart.
    expect(row(addOns, /^Sleeping room/).getByText('Headcount only')).toBeDefined()
    expect(row(addOns, 'Workshop').getAllByRole('cell').at(-1)!.textContent).toBe('1')
    const merchandise = await section('Merchandise')
    expect(
      row(merchandise, 'T-shirt (Men’s, L)')
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['0', '1'])
    const bands = await section('Ticket holders by age band')
    expect(row(bands, 'Teen').getByText('1')).toBeDefined()
    expect(row(bands, 'Adult').getByText('2')).toBeDefined()
  })

  // D5: the answers to a custom field, with how many orders gave each.
  it('lists the answers to each custom field with how many orders gave each', async () => {
    view()

    const answers = await section('Answers to custom fields')
    expect(answers.getByRole('heading', { name: 'City', level: 3 })).toBeDefined()
    expect(row(answers, 'Poznań').getByText('2')).toBeDefined()
    expect(row(answers, 'Gdynia').getByText('1')).toBeDefined()
  })

  // D6: what was sold over time, drawn, and the same days as a table.
  it('draws the revenue and the tickets sold so far over the days', async () => {
    view()

    const over = await section('Sales over time')
    expect(over.getByRole('figure', { name: 'Revenue so far' })).toBeDefined()
    expect(over.getByRole('figure', { name: 'Tickets sold so far' })).toBeDefined()
  })

  it('lists the days something was sold on, each with its revenue and its tickets', async () => {
    view()

    const over = await section('Sales over time')
    expect(over.getByRole('table', { name: 'What was sold on each day' })).toBeDefined()
    const second = row(over, 'Mar 2, 2027')
    expect(second.getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '250.00 PLN',
      '0.00 PLN',
      '2',
    ])
    const fourth = row(over, 'Mar 4, 2027')
    expect(fourth.getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '30.00 PLN',
      '70.00 PLN',
      '1',
    ])
  })

  it('draws nothing over time while nothing was sold', async () => {
    readSales.mockResolvedValue(sales({ days: [] }))
    view()

    await section('Revenue')
    expect(screen.queryByRole('heading', { name: 'Sales over time' })).toBeNull()
  })

  it('says so when nothing was sold yet', async () => {
    readSales.mockResolvedValue(sales({ ticketTypes: [], addOns: [], items: [], customFields: [] }))
    view()

    expect((await section('Tickets')).getByText('The edition has no ticket types.')).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Add-ons', level: 2 })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Merchandise', level: 2 })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Answers to custom fields' })).toBeNull()
  })

  // E1: three lists as files, each read anew when asked for and saved under its own name.
  it.each([
    ['Ticket holders', 'ticket-holders'],
    ['Merchandise pick list', 'merchandise-pick-list'],
    ['Payments', 'payments'],
  ])('downloads the list "%s" as a file', async (label, list) => {
    view()
    const lists = await section('Lists to download')

    fireEvent.click(lists.getByRole('button', { name: label }))

    await waitFor(() => expect(saved.files).toHaveLength(1))
    expect(readFile).toHaveBeenCalledWith(list)
    expect(saved.files[0]!.name).toBe(`${list}-2026.csv`)
  })
})
