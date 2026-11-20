import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type LinkedOrder } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderLinkPage } from './order-link-page'

const api = vi.hoisted(() => ({ open: vi.fn(), renew: vi.fn(), draw: vi.fn() }))

vi.mock('../api/shop', () => ({ openOrderLink: api.open, renewOrderLink: api.renew }))
vi.mock('qrcode', () => ({ toDataURL: api.draw }))

const TOKEN = 'abcDEF_123-xyz456789012345678901234567890ab'
const CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const order = (changes: Partial<LinkedOrder> = {}): LinkedOrder => ({
  number: 'ABCDEFGHJK',
  status: 'paid',
  placedAt: '2027-05-01T10:00:00.000Z',
  convention: { slug: 'convention-a', name: 'Convention A', timezone: 'Europe/Warsaw' },
  edition: {
    slug: '2027',
    name: 'Convention A 2027',
    startsAt: '2027-06-01T08:00:00.000Z',
    endsAt: '2027-06-03T18:00:00.000Z',
  },
  lines: [
    { kind: 'ticket', name: 'Standard', variant: [], quantity: 1, amountMinor: 12000 },
    { kind: 'merchandise', name: 'T-shirt', variant: ['M'], quantity: 2, amountMinor: 16000 },
    { kind: 'discount', name: 'early10', variant: [], quantity: 1, amountMinor: -1200 },
  ],
  totalMinor: 26800,
  currency: 'PLN',
  qrCode: CODE,
  pickupInformation: 'At the merchandise desk in hall A.\nEvery day from 10 to 18.',
  ...changes,
})

const view = (hash = `#${TOKEN}`) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/order${hash}`]}>
          <Routes>
            <Route path="/order" element={<OrderLinkPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const section = async (name: string) =>
  within((await screen.findByRole('heading', { name, level: 2 })).closest('section')!)

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  api.open.mockReset().mockResolvedValue({ state: 'valid', order: order() })
  api.renew.mockReset().mockResolvedValue(undefined)
  api.draw.mockReset().mockResolvedValue('data:image/png;base64,QRCODE')
})

afterEach(cleanup)

// docs/specs/0009-buyer-self-service.md, K2: the lines, the status, the QR code when it is paid
// and the edition's pick-up information. Nothing on it can be changed.
describe('the page an order link opens', () => {
  it('shows the order with its status, its QR code, its lines and where to pick up', async () => {
    view()

    expect(await screen.findByRole('heading', { name: 'Order ABCDEFGHJK', level: 1 })).toBeDefined()
    expect(api.open).toHaveBeenCalledWith(TOKEN)
    expect(screen.getByText('Convention A 2027')).toBeDefined()
    expect(screen.getByText('Paid')).toBeDefined()

    const code = await section('Your QR code')
    const picture = await code.findByRole('img', { name: 'QR code of the order ABCDEFGHJK' })
    expect(picture.getAttribute('src')).toBe('data:image/png;base64,QRCODE')
    expect(api.draw).toHaveBeenCalledWith(CODE, expect.any(Object))
    // The code itself, for a desk that types it by hand.
    expect(code.getByText(CODE)).toBeDefined()

    const lines = await section('What the order holds')
    expect(lines.getByRole('rowheader', { name: 'Standard' })).toBeDefined()
    expect(lines.getByRole('rowheader', { name: '2 × T-shirt (M)' })).toBeDefined()
    expect(lines.getByRole('rowheader', { name: 'Discount code EARLY10' })).toBeDefined()
    const total = lines.getByRole('rowheader', { name: 'Total' }).closest('tr')!
    expect(within(total).getByText(/268[.,]00/)).toBeDefined()

    const pickUp = await section('Picking up merchandise')
    expect(pickUp.getByText(/At the merchandise desk in hall A/)).toBeDefined()
    // Nothing on the page changes the order.
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows no QR code of an order that is not paid, and says what became of it', async () => {
    api.open.mockResolvedValue({
      state: 'valid',
      order: order({ status: 'canceled', qrCode: null, pickupInformation: null }),
    })
    view()

    expect(await screen.findByText('Canceled')).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Your QR code' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Picking up merchandise' })).toBeNull()
    expect(api.draw).not.toHaveBeenCalled()
  })

  // K4: an expired link shows nothing of the order and offers a fresh one, and the answer is
  // the same whether a link was sent or not.
  it('offers to send a fresh link for one that expired, and says the same whatever came of it', async () => {
    api.open.mockResolvedValue({ state: 'expired' })
    view()

    expect(
      await screen.findByRole('heading', { name: 'This link has expired', level: 1 }),
    ).toBeDefined()
    expect(screen.queryByText(/ABCDEFGHJK/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }))

    await waitFor(() => expect(api.renew).toHaveBeenCalledWith(TOKEN))
    expect(
      await screen.findByText(
        'If this link belonged to an order, a new link is on its way to the email address of that order.',
      ),
    ).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Send a new link' })).toBeNull()
  })

  it('says it cannot open the order for a link nobody made, and for an address with no token', async () => {
    api.open.mockRejectedValue(new ORPCError('request.not-found', { status: 404 }))
    view()

    expect(
      await screen.findByRole('heading', { name: 'We cannot open this order', level: 1 }),
    ).toBeDefined()
    cleanup()
    api.open.mockClear()

    view('')

    expect(
      await screen.findByRole('heading', { name: 'We cannot open this order', level: 1 }),
    ).toBeDefined()
    expect(api.open).not.toHaveBeenCalled()
  })
})
