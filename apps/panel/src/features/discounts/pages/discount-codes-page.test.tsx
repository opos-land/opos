import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscountCodesPage } from './discount-codes-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readCodes = vi.hoisted(() => vi.fn())
const createCode = vi.hoisted(() => vi.fn())
const updateCode = vi.hoisted(() => vi.fn())
const removeCode = vi.hoisted(() => vi.fn())

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
  useTenantTime: () => ({
    timeZone: 'Europe/Warsaw',
    format: (iso: string) => iso.slice(0, 10),
    range: (from: string, until: string) => `${from.slice(0, 10)} to ${until.slice(0, 10)}`,
    toInput: (iso: string) => iso.slice(0, 16),
    fromInput: (value: string) => (value ? `${value}:00.000Z` : null),
  }),
}))
vi.mock('../../editions', () => ({
  useEditionBySlug: () => ({
    isPending: false,
    isError: false,
    error: null,
    edition: {
      id: 'edition-2026',
      slug: '2026',
      name: 'Edition 2026',
      startsAt: '2099-07-01T08:00:00.000Z',
      endsAt: '2099-07-03T18:00:00.000Z',
    },
  }),
}))
vi.mock('../../catalog', () => ({
  useMoney: () => ({
    currency: 'PLN',
    format: (minor: number) => `${(minor / 100).toFixed(2)} PLN`,
    toInput: (minor: number) => (minor / 100).toFixed(2),
    parse: (text: string) =>
      /^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text.trim()) * 100) : null,
  }),
  ticketTypesOptions: () => ({
    queryKey: ['catalog', 'ticket-types'],
    queryFn: () => [
      { id: 'standard', name: 'Standard', discountsExcluded: false },
      { id: 'supporter', name: 'Supporter', discountsExcluded: true },
    ],
  }),
  addOnsOptions: () => ({
    queryKey: ['catalog', 'add-ons'],
    queryFn: () => [{ id: 'room', name: 'Sleeping room' }],
  }),
  merchandiseOptions: () => ({
    queryKey: ['catalog', 'merchandise'],
    queryFn: () => [{ id: 'shirt', name: 'T-shirt' }],
  }),
}))
vi.mock('../api/discount-codes', () => ({
  discountCodesOptions: () => ({ queryKey: ['discount-codes', 'list'], queryFn: readCodes }),
  createDiscountCodeOptions: () => ({ mutationFn: createCode }),
  updateDiscountCodeOptions: () => ({ mutationFn: updateCode }),
  removeDiscountCodeOptions: () => ({ mutationFn: removeCode }),
  discountCodesKey: () => ['discount-codes'],
}))

const code = (text: string, fields: object = {}) => ({
  id: `code-${text}`,
  code: text,
  kind: 'percent',
  percent: 10,
  amountMinor: null,
  usageLimit: null,
  uses: 0,
  validFrom: '2020-01-01T10:00:00.000Z',
  validUntil: '2099-01-01T10:00:00.000Z',
  ended: false,
  ticketTypeIds: ['standard'],
  addOnIds: [],
  itemIds: [],
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/discount-codes']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/discount-codes"
              element={<DiscountCodesPage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

/** The row of the table that holds the code of that text. */
const row = (name: string) => screen.getByText(name).closest('tr')!
const empty = () => screen.findByText('The edition has no discount codes yet.')

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  readCodes.mockResolvedValue([])
  for (const mock of [createCode, updateCode, removeCode]) mock.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// docs/specs/0008-discount-codes.md, Screens: the list with each code's uses and limit, and
// ending a code. The form of a new code has a page of its own.
describe('the discount codes page', () => {
  it('shows nothing of the codes to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readCodes).not.toHaveBeenCalled()
  })

  it('lists the codes, each with its value, its uses against its limit and what it applies to', async () => {
    readCodes.mockResolvedValue([
      code('early10', { uses: 3, usageLimit: 10 }),
      code('merch20', {
        kind: 'amount',
        percent: null,
        amountMinor: 2000,
        uses: 1,
        ticketTypeIds: [],
        addOnIds: ['room'],
        itemIds: ['shirt'],
      }),
    ])

    view()

    await screen.findByRole('table', { name: 'Discount codes by their text' })
    expect(screen.getAllByRole('columnheader').map((heading) => heading.textContent)).toEqual([
      'Code',
      'Value',
      'Uses',
      'Valid',
      'Applies to',
      'State',
      'Actions',
    ])
    const cells = (name: string) =>
      [...row(name).querySelectorAll('td')].slice(0, 6).map((cell) => cell.textContent)
    expect(cells('EARLY10')).toEqual([
      'EARLY10',
      '10%',
      '3 of 10',
      '2020-01-01 to 2099-01-01',
      'Standard',
      'Active',
    ])
    expect(cells('MERCH20')).toEqual([
      'MERCH20',
      '20.00 PLN',
      '1, no limit',
      '2020-01-01 to 2099-01-01',
      'Sleeping room, T-shirt',
      'Active',
    ])
  })

  it('opens the page of a code from its row, for a member who may change it', async () => {
    readCodes.mockResolvedValue([code('early10')])
    view()

    const link = await screen.findByRole('link', { name: 'EARLY10' })
    expect(link.getAttribute('href')).toBe(
      '/convention-a/editions/2026/discount-codes/code-early10',
    )
    // The list itself holds no form and deletes nothing.
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete the code' })).toBeNull()
  })

  it('says why a code cannot be used now', async () => {
    readCodes.mockResolvedValue([
      code('ended-one', { ended: true }),
      code('expired-one', { validUntil: '2021-01-01T10:00:00.000Z' }),
      code('later-one', { validFrom: '2098-01-01T10:00:00.000Z' }),
      code('used-one', { uses: 1, usageLimit: 1 }),
    ])

    view()

    await screen.findByText('ENDED-ONE')
    expect(within(row('ENDED-ONE')).getByText('Ended')).toBeDefined()
    expect(within(row('EXPIRED-ONE')).getByText('Expired')).toBeDefined()
    expect(within(row('LATER-ONE')).getByText('Not valid yet')).toBeDefined()
    expect(within(row('USED-ONE')).getByText('Used up')).toBeDefined()
  })

  it('lets a member with read access see the codes and change nothing', async () => {
    state.tickets = 'read'
    readCodes.mockResolvedValue([code('early10')])

    view()

    await screen.findByText('EARLY10')
    expect(screen.queryByRole('button')).toBeNull()
    // No page to open either: the page of a code is where it is changed.
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull()
  })

  it('links a member who may add to the page of a new code, and holds no form of one', async () => {
    view()
    await empty()

    expect(screen.getByRole('link', { name: 'New discount code' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/discount-codes/new',
    )
    expect(screen.queryByLabelText('Code')).toBeNull()
  })

  it('ends a code without asking, and lets an ended one run again', async () => {
    readCodes.mockResolvedValue([code('early10'), code('guest100', { ended: true })])
    view()
    await screen.findByText('EARLY10')

    fireEvent.click(within(row('EARLY10')).getByRole('button', { name: 'End the code' }))
    fireEvent.click(within(row('GUEST100')).getByRole('button', { name: 'Let it run again' }))

    await waitFor(() => expect(updateCode).toHaveBeenCalledTimes(2))
    expect(updateCode.mock.calls.map(([call]) => call as object)).toEqual([
      { params: { editionId: 'edition-2026', codeId: 'code-early10' }, body: { ended: true } },
      { params: { editionId: 'edition-2026', codeId: 'code-guest100' }, body: { ended: false } },
    ])
  })
})
