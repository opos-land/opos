import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrdersInReview } from './orders-in-review'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readOrders = vi.hoisted(() => vi.fn())

vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    access: { edition: () => ({ tickets: state.tickets }) },
    api: {},
  }),
}))
vi.mock('../api/orders', () => ({
  ordersOptions: (_: unknown, editionId: string, query: object) => ({
    queryKey: ['orders', editionId, query],
    queryFn: () => readOrders(query) as unknown,
  }),
}))

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <OrdersInReview editionId="edition-2026" to="/convention-a/editions/2026/orders" />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'read'
  readOrders.mockResolvedValue({ orders: [], total: 0, needsReview: 2 })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// The panel shows on the edition how many orders need review, until each is settled
// (docs/specs/0006-order-management.md, F3).
describe('OrdersInReview', () => {
  it('says how many orders of the edition need review, with the way to them', async () => {
    view()

    expect(await screen.findByText(/2 orders need review/)).toBeDefined()
    expect(screen.getByRole('link', { name: 'See the orders' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/orders',
    )
    // The count alone is read: one order of the page, none of its data shown.
    expect(readOrders).toHaveBeenCalledWith({ status: 'needs-review', limit: 1 })
  })

  it('says nothing while none needs review', async () => {
    readOrders.mockResolvedValue({ orders: [], total: 0, needsReview: 0 })
    view()

    await waitFor(() => expect(readOrders).toHaveBeenCalled())
    expect(screen.queryByText(/review/)).toBeNull()
  })

  it('reads nothing for a member without tickets access', () => {
    state.tickets = 'none'
    view()

    expect(readOrders).not.toHaveBeenCalled()
    expect(screen.queryByText(/review/)).toBeNull()
  })
})
