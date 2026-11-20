import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type OrderResult } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultPage } from './result-page'

const api = vi.hoisted(() => ({ result: vi.fn(), start: vi.fn(), leave: vi.fn() }))

vi.mock('../api/shop', () => ({
  orderResultOptions: (slug: string, orderId: string, token: string) => ({
    queryKey: ['result', slug, orderId, token],
    queryFn: () => api.result(slug, orderId, token) as Promise<OrderResult>,
  }),
  startPaymentAttemptByToken: api.start,
}))
vi.mock('../model/leave', () => ({ leaveTo: api.leave }))

const MINUTE = 60_000
const result = (changes: Partial<OrderResult> = {}): OrderResult => ({
  number: 'ABCDEFGHJK',
  status: 'awaiting-payment',
  holdEndsAt: new Date(Date.now() + 20 * MINUTE).toISOString(),
  failureReason: null,
  moneyWith: null,
  editionSlug: '2027',
  ...changes,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/conventions/convention-a/2027/shop/result/order-1']}>
          <Routes>
            <Route
              path="/conventions/:tenantSlug/:editionSlug/shop/result/:orderId"
              element={<ResultPage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  window.sessionStorage.clear()
  window.sessionStorage.setItem('opos-order-result:order-1', 'token-1')
  api.result.mockReset().mockResolvedValue(result())
  api.start.mockReset().mockResolvedValue({ redirectUrl: 'https://provider.test/pay/2' })
  api.leave.mockReset()
})

afterEach(cleanup)

describe('ResultPage', () => {
  it('says "Paid" with the order’s number and that the QR code was emailed', async () => {
    api.result.mockResolvedValue(result({ status: 'paid', holdEndsAt: null }))
    view()

    expect(await screen.findByRole('heading', { name: 'Paid', level: 1 })).toBeDefined()
    expect(screen.getByText('ABCDEFGHJK')).toBeDefined()
    expect(screen.getByText(/QR code.*email/i)).toBeDefined()
    expect(api.result).toHaveBeenCalledWith('convention-a', 'order-1', 'token-1')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  // The buyer's return is never proof of payment: until the provider confirms, it is not paid.
  it('says "Not paid yet" before a confirmation, and offers another try within the hold', async () => {
    view()

    expect(await screen.findByRole('heading', { name: 'Not paid yet', level: 1 })).toBeDefined()
    expect(screen.getByText(/updates by itself/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(api.leave).toHaveBeenCalledWith('https://provider.test/pay/2'))
    expect(api.start).toHaveBeenCalledWith('convention-a', 'order-1', 'token-1')
  })

  it.each([
    ['declined', 'The payment was declined.'],
    ['insufficient-funds', 'There was not enough money to pay.'],
    ['wrong-code', 'The code was wrong.'],
    ['timed-out', 'The payment took too long.'],
    ['canceled', 'The payment was canceled.'],
    ['failed', 'The payment failed.'],
  ] as const)('says why an attempt failed (%s), and offers another try', async (reason, text) => {
    api.result.mockResolvedValue(result({ failureReason: reason }))
    view()

    expect(await screen.findByText(text)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined()
  })

  it.each([
    [
      'an order whose hold ended',
      result({ holdEndsAt: new Date(Date.now() - MINUTE).toISOString() }),
    ],
    ['an expired order', result({ status: 'expired', holdEndsAt: null })],
  ])('says the order expired for %s, and links a new checkout', async (_, shown) => {
    api.result.mockResolvedValue(shown)
    view()

    expect(
      await screen.findByRole('heading', { name: 'The order expired', level: 1 }),
    ).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Start a new order' }).getAttribute('href')).toBe(
      '/conventions/convention-a/2027/shop',
    )
  })

  it('says of an order that needs review that the payment arrived and where the money is', async () => {
    api.result.mockResolvedValue(
      result({
        status: 'needs-review',
        holdEndsAt: null,
        moneyWith: { en: 'The money is with the convention.', pl: 'Pieniądze są u konwentu.' },
      }),
    )
    view()

    expect(
      await screen.findByRole('heading', { name: 'Your payment is under review', level: 1 }),
    ).toBeDefined()
    expect(screen.getByText('The money is with the convention.')).toBeDefined()
    expect(screen.getByText(/will get in touch/)).toBeDefined()
  })

  it('checks the status again when another try finds the order paid meanwhile', async () => {
    api.start.mockRejectedValue(new ORPCError('order.already-paid', { status: 409 }))
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    api.result.mockResolvedValue(result({ status: 'paid', holdEndsAt: null }))

    expect(await screen.findByRole('heading', { name: 'Paid', level: 1 })).toBeDefined()
    expect(api.leave).not.toHaveBeenCalled()
  })

  // The result page opens with the order's result token alone.
  it('shows nothing of an order in a tab that holds no token of it', async () => {
    window.sessionStorage.clear()
    view()

    expect(await screen.findByText(/cannot show this order/)).toBeDefined()
    expect(api.result).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Go to the shop' }).getAttribute('href')).toBe(
      '/conventions/convention-a/2027/shop',
    )
  })

  it('is an unknown address for a token that opens nothing', async () => {
    api.result.mockRejectedValue(new ORPCError('request.not-found', { status: 404 }))
    view()

    expect(await screen.findByText(/cannot show this order/)).toBeDefined()
  })
})
