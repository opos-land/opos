import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrdersPage } from './orders-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readOrders = vi.hoisted(() => vi.fn())
const asked = vi.hoisted(() => ({ queries: [] as object[] }))

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
    format: (iso: string) => `at ${iso}`,
    fromInput: (value: string) => `${value}:00.000Z`,
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
  useMoney: () => ({ format: (minor: number) => `${minor / 100} PLN` }),
  ticketTypesOptions: () => ({
    queryKey: ['catalog', 'ticket-types'],
    queryFn: () => [{ id: 'standard', name: 'Standard' }],
  }),
  addOnsOptions: () => ({ queryKey: ['catalog', 'add-ons'], queryFn: () => [] }),
  merchandiseOptions: () => ({
    queryKey: ['catalog', 'merchandise'],
    queryFn: () => [
      {
        id: 'shirt',
        name: 'Shirt',
        axes: [{ values: [{ id: 'l', label: 'L' }] }],
        variants: [{ id: 'shirt-l', valueIds: ['l'] }],
      },
    ],
  }),
}))
vi.mock('../api/orders', () => ({
  ordersOptions: (_: unknown, editionId: string, query: object) => ({
    queryKey: ['orders', editionId, query],
    queryFn: () => {
      asked.queries.push(query)
      return readOrders(query) as unknown
    },
  }),
}))

const order = (number: string, fields: object = {}) => ({
  id: `id-${number}`,
  number,
  status: 'paid',
  email: 'buyer@example.test',
  holderName: 'Ada Lovelace',
  totalMinor: 10000,
  placedAt: '2026-05-01T10:00:00.000Z',
  manualReason: null,
  ticketType: 'Standard',
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/orders']}>
          <Routes>
            <Route path="/:tenantSlug/editions/:editionSlug/orders" element={<OrdersPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const lastQuery = () => asked.queries.at(-1)

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  asked.queries = []
  readOrders.mockResolvedValue({ orders: [], total: 0, needsReview: 0 })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the orders page', () => {
  it('shows nothing of the orders to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readOrders).not.toHaveBeenCalled()
  })

  it('lists the orders as the API orders them, each a link to its page', async () => {
    readOrders.mockResolvedValue({
      orders: [
        order('REVIEW2222', { status: 'needs-review' }),
        order('MANUAL2222', {
          status: 'paid-manual',
          email: null,
          holderName: '',
          manualReason: 'desk',
          ticketType: null,
        }),
      ],
      total: 2,
      needsReview: 1,
    })

    view()

    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(3)
    const review = within(rows[1]!)
    expect(review.getByRole('link', { name: 'REVIEW2222' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/orders/id-REVIEW2222',
    )
    expect(review.getByText('Needs review')).toBeDefined()
    expect(review.getByText('Ada Lovelace')).toBeDefined()
    expect(review.getByText('100 PLN')).toBeDefined()
    expect(within(rows[2]!).getByText('Paid - manual')).toBeDefined()
    // How many of the edition's orders wait for an org, whatever is searched.
    expect(screen.getByText(/1 order needs review/i)).toBeDefined()
    expect(lastQuery()).toEqual({ offset: 0, limit: 50 })
  })

  it('searches by what is typed, and by the hash of a QR code', async () => {
    view()
    await screen.findByText(/no order/i)

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: ' hopper ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(lastQuery()).toEqual({ q: 'hopper', offset: 0, limit: 50 }))

    fireEvent.change(screen.getByLabelText(/search/i), {
      target: { value: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(lastQuery()).toEqual({
        qrCodeHash: '2fd67e69907bff621c0c4078b1aef595c8562a11f840dd0ec5c5d7c0a4e59331',
        offset: 0,
        limit: 50,
      }),
    )
  })

  it('filters by status, by what an order holds and by the day it was placed', async () => {
    view()
    await screen.findByText(/no order/i)

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'canceled' } })
    await waitFor(() => expect(lastQuery()).toMatchObject({ status: 'canceled' }))

    fireEvent.change(await screen.findByLabelText('Holds'), {
      target: { value: 'variant:shirt-l' },
    })
    await waitFor(() =>
      expect(lastQuery()).toEqual({
        status: 'canceled',
        variantId: 'shirt-l',
        offset: 0,
        limit: 50,
      }),
    )

    fireEvent.change(screen.getByLabelText('Holds'), { target: { value: 'ticket:standard' } })
    fireEvent.change(screen.getByLabelText('Placed from'), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText('Placed until'), { target: { value: '2026-05-31' } })
    await waitFor(() =>
      expect(lastQuery()).toEqual({
        status: 'canceled',
        ticketTypeId: 'standard',
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-31T23:59:59.999Z',
        offset: 0,
        limit: 50,
      }),
    )
  })

  it('turns the pages of a long list', async () => {
    readOrders.mockImplementation((query: { offset: number }) =>
      Promise.resolve({
        orders: [order(query.offset === 0 ? 'FIRST22222' : 'SECOND2222')],
        total: 51,
        needsReview: 0,
      }),
    )
    view()

    expect(await screen.findByText('FIRST22222')).toBeDefined()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous page' }).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByText('SECOND2222')).toBeDefined()
    expect(lastQuery()).toEqual({ offset: 50, limit: 50 })
  })

  it('offers a manual order to an org who may write, and to no other', async () => {
    view()
    expect(await screen.findByRole('link', { name: /new manual order/i })).toBeDefined()
    cleanup()

    state.tickets = 'read'
    view()
    await screen.findByText(/no order/i)
    expect(screen.queryByRole('link', { name: /new manual order/i })).toBeNull()
    expect(screen.getByRole('link', { name: /production numbers/i })).toBeDefined()
  })
})
