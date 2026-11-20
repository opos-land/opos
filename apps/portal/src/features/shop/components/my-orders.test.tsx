import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type MyOrder } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { MyOrders } from './my-orders'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  resend: vi.fn(),
  payNow: vi.fn(),
  leave: vi.fn(),
  failure: vi.fn(),
}))

vi.mock('../api/shop', () => ({
  myOrdersOptions: (slug: string) => ({
    queryKey: ['my-orders', slug],
    queryFn: () => api.list(slug) as Promise<MyOrder[]>,
  }),
  resendConfirmation: api.resend,
  payNow: api.payNow,
}))
vi.mock('../model/leave', () => ({ leaveTo: api.leave }))
vi.mock('../../../shared/lib/notify', () => ({ notifyFailure: api.failure }))

const MINUTE = 60_000
const account = {
  id: 'account-1',
  email: 'jan@example.test',
  firstName: 'Jan',
  lastName: 'Kowal',
  locale: null,
  theme: null,
  mfaEnabled: false,
}

const order = (number: string, changes: Partial<MyOrder> = {}): MyOrder => ({
  id: `order-${number}`,
  number,
  status: 'paid',
  placedAt: '2027-05-01T10:00:00.000Z',
  holdEndsAt: null,
  holderName: 'Ada Lovelace',
  edition: { id: 'edition-1', slug: '2027', name: 'Convention A 2027' },
  lines: [{ kind: 'ticket', name: 'Standard', variant: [], quantity: 1, amountMinor: 12000 }],
  totalMinor: 12000,
  currency: 'PLN',
  bought: { ticketTypeId: 'standard', addOnIds: [], itemIds: [] },
  ...changes,
})
const awaiting = (number: string, minutesLeft: number) =>
  order(number, {
    status: 'awaiting-payment',
    holdEndsAt: new Date(Date.now() + minutesLeft * MINUTE).toISOString(),
    bought: null,
  })

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <MyOrders tenantSlug="convention-a" timeZone="Europe/Warsaw" />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const item = (number: string) => screen.findByRole('listitem', { name: `Order ${number}` })

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  useSession.setState({ status: 'ready', account })
  for (const mock of Object.values(api)) mock.mockReset()
  api.list.mockResolvedValue([])
  api.resend.mockResolvedValue(undefined)
  api.payNow.mockResolvedValue({ redirectUrl: 'https://provider.test/pay/7' })
})

afterEach(cleanup)

// docs/specs/0009-buyer-self-service.md, U1-U4: a signed-in account sees, on a convention's
// page, its orders in that convention with what it can do with each.
describe('the orders of an account on a convention’s page', () => {
  it('are asked for by nobody who is not signed in, and take no place when there are none', async () => {
    useSession.setState({ status: 'ready', account: null })
    const visitor = view()
    expect(visitor.container.textContent).toBe('')
    expect(api.list).not.toHaveBeenCalled()
    cleanup()

    useSession.setState({ status: 'ready', account })
    const buyer = view()
    await waitFor(() => expect(api.list).toHaveBeenCalledWith('convention-a'))
    expect(buyer.container.textContent).toBe('')
  })

  it('are listed in the order they come, each with its edition, its status and what it holds', async () => {
    api.list.mockResolvedValue([
      awaiting('NEWEST2222', 20),
      order('PAD2222222', {
        lines: [
          { kind: 'ticket', name: 'Standard', variant: [], quantity: 1, amountMinor: 12000 },
          { kind: 'merchandise', name: 'T-shirt', variant: ['M'], quantity: 2, amountMinor: 16000 },
        ],
        totalMinor: 28000,
      }),
    ])
    view()

    expect(await screen.findByRole('heading', { name: 'Your orders', level: 2 })).toBeDefined()
    const numbers = screen
      .getAllByRole('listitem')
      .map((row) => row.getAttribute('aria-labelledby'))
    expect(numbers).toHaveLength(2)
    const paid = await item('PAD2222222')
    expect(within(paid).getByText('Paid')).toBeDefined()
    expect(within(paid).getByText(/Convention A 2027/)).toBeDefined()
    expect(within(paid).getByText(/Ada Lovelace/)).toBeDefined()
    expect(within(paid).getByRole('rowheader', { name: '2 × T-shirt (M)' })).toBeDefined()
    expect(within(await item('NEWEST2222')).getByText('Awaiting payment')).toBeDefined()
  })

  // U2: a paid order offers "Resend QR code" and "Buy more".
  it('offer a paid order its QR code again, and more for the same ticket', async () => {
    api.list.mockResolvedValue([order('PAD2222222')])
    view()
    const paid = await item('PAD2222222')

    expect(within(paid).getByRole('link', { name: 'Buy more' }).getAttribute('href')).toBe(
      '/conventions/convention-a/2027/shop/checkout?extends=order-PAD2222222',
    )
    expect(within(paid).queryByRole('button', { name: 'Pay now' })).toBeNull()
    fireEvent.click(within(paid).getByRole('button', { name: 'Resend QR code' }))

    await waitFor(() => expect(api.resend).toHaveBeenCalledWith('convention-a', 'order-PAD2222222'))
  })

  // An order an org moved to another email passed to another person: nothing is added to it.
  it('offer no "Buy more" for a paid order nothing can be added to', async () => {
    api.list.mockResolvedValue([order('MQVED22222', { bought: null })])
    view()
    const moved = await item('MQVED22222')

    expect(within(moved).getByRole('button', { name: 'Resend QR code' })).toBeDefined()
    expect(within(moved).queryByRole('link', { name: 'Buy more' })).toBeNull()
  })

  // U3: an unpaid order within its hold offers "Pay now"; after the hold nothing starts.
  it('offer "Pay now" within the hold alone, and send the buyer to the provider', async () => {
    api.list.mockResolvedValue([awaiting('HELD222222', 20), awaiting('LATE222222', -5)])
    view()
    const held = await item('HELD222222')
    const late = await item('LATE222222')

    expect(within(late).queryByRole('button', { name: 'Pay now' })).toBeNull()
    expect(within(late).getByText(/The time to pay for this order has ended/)).toBeDefined()
    expect(within(held).queryByRole('link', { name: 'Buy more' })).toBeNull()
    expect(within(held).queryByRole('button', { name: 'Resend QR code' })).toBeNull()
    fireEvent.click(within(held).getByRole('button', { name: 'Pay now' }))

    await waitFor(() => expect(api.leave).toHaveBeenCalledWith('https://provider.test/pay/7'))
    expect(api.payNow).toHaveBeenCalledWith('convention-a', 'edition-1', 'order-HELD222222')
  })

  it('read the orders again when an order turns out paid or expired meanwhile', async () => {
    api.list.mockResolvedValue([awaiting('HELD222222', 20)])
    api.payNow.mockRejectedValue(new ORPCError('order.already-paid', { status: 409 }))
    view()

    fireEvent.click(within(await item('HELD222222')).getByRole('button', { name: 'Pay now' }))

    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
    expect(api.leave).not.toHaveBeenCalled()
    expect(api.failure).not.toHaveBeenCalled()
  })

  it('offer nothing for an order that expired or was canceled', async () => {
    api.list.mockResolvedValue([
      order('GQNE222222', { status: 'expired', bought: null }),
      order('CANCE22222', { status: 'canceled', bought: null }),
    ])
    view()

    for (const number of ['GQNE222222', 'CANCE22222']) {
      const row = await item(number)
      expect(within(row).queryByRole('button')).toBeNull()
      expect(within(row).queryByRole('link')).toBeNull()
    }
  })
})
