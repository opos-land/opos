import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderPage } from './order-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readOrder = vi.hoisted(() => vi.fn())
const writes = vi.hoisted(() => ({
  updateHolder: vi.fn(),
  changeEmail: vi.fn(),
  swapVariant: vi.fn(),
  cancel: vi.fn(),
  markPaid: vi.fn(),
  decline: vi.fn(),
  resend: vi.fn(),
  handOut: vi.fn(),
  takeBack: vi.fn(),
}))

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
  useTenantTime: () => ({ format: (iso: string) => `at ${iso}` }),
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
  merchandiseOptions: () => ({
    queryKey: ['catalog', 'merchandise'],
    queryFn: () => [
      {
        id: 'shirt',
        name: 'Shirt',
        axes: [
          {
            values: [
              { id: 'm', label: 'M' },
              { id: 'l', label: 'L' },
            ],
          },
        ],
        variants: [
          { id: 'shirt-m', valueIds: ['m'], hidden: false },
          { id: 'shirt-l', valueIds: ['l'], hidden: false },
        ],
      },
    ],
  }),
}))
vi.mock('../api/orders', () => ({
  ordersKey: () => ['orders'],
  orderOptions: () => ({ queryKey: ['orders', 'one'], queryFn: readOrder }),
  updateHolderOptions: () => ({ mutationFn: writes.updateHolder }),
  changeEmailOptions: () => ({ mutationFn: writes.changeEmail }),
  swapVariantOptions: () => ({ mutationFn: writes.swapVariant }),
  cancelOrderOptions: () => ({ mutationFn: writes.cancel }),
  markPaidOptions: () => ({ mutationFn: writes.markPaid }),
  declineOrderOptions: () => ({ mutationFn: writes.decline }),
  resendConfirmationOptions: () => ({ mutationFn: writes.resend }),
  handOutOptions: () => ({ mutationFn: writes.handOut }),
  takeBackHandOutOptions: () => ({ mutationFn: writes.takeBack }),
}))

const order = (fields: object = {}) => ({
  id: 'order-1',
  number: 'ABCDEFGHJK',
  status: 'paid',
  email: 'buyer@example.test',
  holderName: 'Ada Lovelace',
  ageBand: 'adult',
  guardianConsentAcknowledgedAt: null,
  totalMinor: 15000,
  paidMinor: 15000,
  currency: 'PLN',
  holds: true,
  placedAt: '2026-05-01T10:00:00.000Z',
  paidAt: '2026-05-01T10:05:00.000Z',
  manualReason: null,
  note: null,
  reviewCause: null,
  canceledAt: null,
  cancelReason: null,
  declinedAt: null,
  declineReason: null,
  discountCode: null,
  hasQrCode: true,
  lines: [
    {
      id: 'line-ticket',
      kind: 'ticket',
      name: 'Standard',
      variant: [],
      merchandiseItemId: null,
      variantId: null,
      quantity: 1,
      unitAmountMinor: 10000,
      amountMinor: 10000,
      handedOutAt: null,
    },
    {
      id: 'line-shirt',
      kind: 'merchandise',
      name: 'Shirt',
      variant: ['M'],
      merchandiseItemId: 'shirt',
      variantId: 'shirt-m',
      quantity: 1,
      unitAmountMinor: 5000,
      amountMinor: 5000,
      handedOutAt: '2026-06-01T09:00:00.000Z',
    },
  ],
  answers: [{ fieldId: 'city', label: 'City', answer: 'Gdynia' }],
  consents: [
    {
      consentId: 'rules',
      text: 'I accept the rules',
      acceptedAt: '2026-05-01T10:00:00.000Z',
      document: { title: 'Rules', versionId: 'v2', number: 2 },
    },
  ],
  attempts: [
    {
      id: 'attempt-1',
      provider: 'fake',
      status: 'paid',
      amountMinor: 15000,
      paidAmountMinor: 15000,
      startedAt: '2026-05-01T10:01:00.000Z',
      paidAt: '2026-05-01T10:05:00.000Z',
      confirmedAt: '2026-05-01T10:05:01.000Z',
      moneyWith: 'convention',
      failureReason: null,
      failureCode: null,
      failureMessage: null,
      information: { transaction: 'TX-1' },
    },
  ],
  emails: [
    {
      id: 'email-1',
      kind: 'order-confirmation',
      recipient: 'buyer@example.test',
      queuedAt: '2026-05-01T10:05:01.000Z',
      sentAt: '2026-05-01T10:05:10.000Z',
      withdrawnAt: null,
      failedAttempts: 0,
    },
  ],
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/orders/order-1']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/orders/:orderId"
              element={<OrderPage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/emails/:emailId"
              element={<p>the page of the email</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const at = { params: { editionId: 'edition-2026', orderId: 'order-1' } }
const sent = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls[0]?.[0] as unknown
/** A section of the page by its heading, once the order is read. */
const section = async (name: string | RegExp) =>
  within((await screen.findByRole('heading', { name })).closest('section')!)

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  readOrder.mockResolvedValue(order())
  for (const write of Object.values(writes)) write.mockResolvedValue(order())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the page of an order', () => {
  it('shows everything the order keeps', async () => {
    view()

    expect(await screen.findByRole('heading', { name: /ABCDEFGHJK/ })).toBeDefined()
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0)
    expect(screen.getByText('Ada Lovelace')).toBeDefined()
    expect(screen.getByText('buyer@example.test', { selector: 'dd' })).toBeDefined()
    const lines = await section('What the order holds')
    expect(lines.getByText('Standard')).toBeDefined()
    expect(lines.getByText('Shirt (M)')).toBeDefined()
    expect(lines.getByText('150 PLN')).toBeDefined()
    expect(screen.getByText('Gdynia')).toBeDefined()
    expect(screen.getByText(/Rules, version 2/)).toBeDefined()
    expect(screen.getByText('TX-1')).toBeDefined()
    expect(screen.getByText('With the convention')).toBeDefined()
    expect(screen.getByText('Confirmation with the QR code')).toBeDefined()
  })

  // docs/specs/0008-discount-codes.md, D5: a code stays on the orders that used it.
  it('shows what a discount code took off as a line under the code, with no hand-out', async () => {
    const plain = order()
    readOrder.mockResolvedValue({
      ...plain,
      discountCode: 'early10',
      totalMinor: 14000,
      lines: [
        ...plain.lines,
        {
          id: 'line-discount',
          kind: 'discount',
          name: 'early10',
          variant: [],
          merchandiseItemId: null,
          variantId: null,
          quantity: 1,
          unitAmountMinor: -1000,
          amountMinor: -1000,
          handedOutAt: null,
        },
      ],
    })
    view()

    const lines = await section('What the order holds')
    const discount = lines.getByText('Discount code EARLY10').closest('tr')!
    expect(within(discount).getByText('-10 PLN')).toBeDefined()
    expect(within(discount).queryByRole('button')).toBeNull()
    expect(within(discount).queryByText('Not yet')).toBeNull()
  })

  it('lists an alert to the orgs without their addresses, and an email that was withdrawn', async () => {
    const email = (fields: object) => ({
      id: 'email',
      kind: 'order-confirmation',
      recipient: 'old@example.test',
      queuedAt: '2026-05-01T10:05:01.000Z',
      sentAt: null,
      withdrawnAt: null,
      failedAttempts: 0,
      ...fields,
    })
    readOrder.mockResolvedValue(
      order({
        emails: [
          email({ id: 'alert', kind: 'needs-review', recipient: null }),
          email({ id: 'stale', withdrawnAt: '2026-05-02T08:00:00.000Z' }),
          // A fresh order link the buyer asked for once the first one expired.
          email({ id: 'link', kind: 'order-link' }),
          email({ id: 'reminder', kind: 'pre-edition-reminder' }),
        ],
      }),
    )
    view()
    const emails = await section('Emails')

    expect(await emails.findByText('The organizers')).toBeDefined()
    expect(emails.getByText('A new order link')).toBeDefined()
    expect(emails.getByText('Reminder before the edition')).toBeDefined()
    expect(emails.getByText(/Not sent: the order moved to another address/)).toBeDefined()
  })

  it('opens the page of an email, where what it said is read, from its row', async () => {
    view()
    const emails = await section('Emails')

    const link = await emails.findByRole('link', { name: 'Confirmation with the QR code' })
    expect(link.getAttribute('href')).toBe('/convention-a/editions/2026/emails/email-1')
    fireEvent.click(emails.getByText('buyer@example.test'))

    expect(await screen.findByText('the page of the email')).toBeDefined()
  })

  // What a provider's module keeps of a payment is named in the member's language, and an
  // amount among it is shown as money.
  it('names what the provider keeps of a payment, and why an attempt failed', async () => {
    const attempt = (order().attempts as object[])[0]!
    readOrder.mockResolvedValue(
      order({
        attempts: [
          {
            ...attempt,
            information: { transaction: 'TX-1', batch: '77', commissionMinor: '123', other: 'x' },
          },
          {
            ...attempt,
            id: 'attempt-2',
            status: 'failed',
            paidAmountMinor: null,
            moneyWith: null,
            failureReason: 'insufficient-funds',
            failureCode: 'err49',
            failureMessage: 'Brak środków',
            information: {},
          },
        ],
      }),
    )
    view()
    const attempts = await section('Payment attempts')

    expect(await attempts.findByText(/Transaction number/)).toBeDefined()
    expect(attempts.getByText(/Payout batch number/)).toBeDefined()
    expect(attempts.getByText(/Commission/).textContent).toContain('1.23 PLN')
    // A key the panel does not know is shown as the module gave it.
    expect(attempts.getByText(/other/)).toBeDefined()
    expect(attempts.getByText('There was not enough money to pay.')).toBeDefined()
    expect(attempts.getByText(/err49: Brak środków/)).toBeDefined()
  })

  it('says a teen’s guardian consent is brought on paper', async () => {
    readOrder.mockResolvedValue(
      order({ ageBand: 'teen', guardianConsentAcknowledgedAt: '2026-05-01T10:00:00.000Z' }),
    )
    view()

    expect(await screen.findByText('Teen')).toBeDefined()
    expect(screen.getByText('Brought on paper to the convention')).toBeDefined()
  })

  it('corrects the ticket holder’s name', async () => {
    view()
    const form = await section('Ticket holder’s name')
    const field = await form.findByLabelText<HTMLInputElement>('Ticket holder’s name')
    expect(field.value).toBe('Ada Lovelace')

    fireEvent.change(field, { target: { value: 'Grace Hopper' } })
    fireEvent.click(form.getByRole('button', { name: 'Save the name' }))

    await waitFor(() =>
      expect(sent(writes.updateHolder)).toEqual({ ...at, body: { holderName: 'Grace Hopper' } }),
    )
  })

  it('moves the order to another email only through a modal that says what stops working', async () => {
    view()
    const form = await section('Email of the order')

    fireEvent.change(await form.findByLabelText('New email address'), {
      target: { value: 'moved@example.test' },
    })
    fireEvent.click(form.getByRole('button', { name: 'Change the email' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText(/ABCDEFGHJK/)).toBeDefined()
    expect(dialog.getByText(/QR code and the order link sent so far stop working/)).toBeDefined()
    expect(writes.changeEmail).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Change the email' }))

    await waitFor(() =>
      expect(sent(writes.changeEmail)).toEqual({ ...at, body: { email: 'moved@example.test' } }),
    )
  })

  it('swaps a merchandise line for another variant of its item', async () => {
    view()
    const lines = await section('What the order holds')

    fireEvent.change(await lines.findByLabelText('Variant of Shirt'), {
      target: { value: 'shirt-l' },
    })
    fireEvent.click(lines.getByRole('button', { name: 'Swap the variant' }))

    await waitFor(() =>
      expect(sent(writes.swapVariant)).toEqual({
        params: { ...at.params, lineId: 'line-shirt' },
        body: { variantId: 'shirt-l' },
      }),
    )
  })

  it('marks a line handed out and takes a mark back', async () => {
    view()
    const lines = await section('What the order holds')

    fireEvent.click(await lines.findByRole('button', { name: 'Mark Standard as handed out' }))
    await waitFor(() =>
      expect(sent(writes.handOut)).toEqual({ ...at, body: { lineIds: ['line-ticket'] } }),
    )
    fireEvent.click(lines.getByRole('button', { name: 'Take back the hand-out of Shirt' }))
    await waitFor(() =>
      expect(sent(writes.takeBack)).toEqual({ params: { ...at.params, lineId: 'line-shirt' } }),
    )
  })

  it('resends the confirmation', async () => {
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Resend the QR code' }))

    await waitFor(() => expect(sent(writes.resend)).toEqual(at))
  })

  // OPOS returns no money: the screen says so before the org confirms.
  it('cancels through a modal that takes a reason and says no money is returned', async () => {
    view()
    const cancel = await section('Cancel the order')

    fireEvent.change(await cancel.findByLabelText('Reason of the cancellation'), {
      target: { value: 'Asked for it' },
    })
    fireEvent.click(cancel.getByRole('button', { name: 'Cancel the order' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText(/OPOS returns no money/)).toBeDefined()
    expect(dialog.getByText(/ABCDEFGHJK/)).toBeDefined()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel the order' }))

    await waitFor(() =>
      expect(sent(writes.cancel)).toEqual({ ...at, body: { reason: 'Asked for it' } }),
    )
  })

  it('settles an order in review: what was paid beside the total, marked paid or declined', async () => {
    readOrder.mockResolvedValue(
      order({ status: 'needs-review', reviewCause: 'amount', paidMinor: 14000, hasQrCode: false }),
    )
    view()
    const review = await section('This order needs review')

    expect(await review.findByText(/amount paid differs/i)).toBeDefined()
    expect(review.getByText('Amount paid')).toBeDefined()
    expect(review.getByText('140 PLN')).toBeDefined()
    expect(review.getByText('150 PLN')).toBeDefined()
    expect(review.getByText('10 PLN')).toBeDefined()
    // Nothing to correct, resend or cancel while it waits.
    expect(screen.queryByRole('heading', { name: 'Cancel the order' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resend the QR code' })).toBeNull()

    fireEvent.click(review.getByRole('button', { name: 'Mark as paid' }))
    await waitFor(() => expect(sent(writes.markPaid)).toEqual(at))

    fireEvent.change(review.getByLabelText('Reason of the decline'), {
      target: { value: 'Too little' },
    })
    fireEvent.click(review.getByRole('button', { name: 'Decline the payment' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Decline the payment' }))
    await waitFor(() =>
      expect(sent(writes.decline)).toEqual({ ...at, body: { reason: 'Too little' } }),
    )
  })

  // docs/specs/0006-order-management.md, R5: marked paid, the order keeps showing the difference.
  it('shows what was paid beside the total and the difference whenever they differ', async () => {
    readOrder.mockResolvedValue(order({ paidMinor: 14000 }))
    view()

    const facts = await section('The order')
    // An amount of its own, apart from the moment the order was paid.
    expect(facts.getByText('Amount paid')).toBeDefined()
    expect(facts.getByText('140 PLN')).toBeDefined()
    expect(facts.getByText('150 PLN')).toBeDefined()
    expect(facts.getByText('Difference')).toBeDefined()
    expect(facts.getByText('10 PLN')).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'This order needs review' })).toBeNull()
    cleanup()

    // Paid as much as the total, or with no payment at all as a manual order: nothing to tell.
    for (const same of [order(), order({ status: 'paid-manual', paidMinor: 0, attempts: [] })]) {
      readOrder.mockResolvedValue(same)
      view()
      const none = await section('The order')
      expect(none.queryByText('Difference')).toBeNull()
      expect(none.queryByText('Total of the order')).toBeNull()
      cleanup()
    }
  })

  it('shows a manual order with its reason, and offers it no email to change or resend', async () => {
    readOrder.mockResolvedValue(
      order({
        status: 'paid-manual',
        email: null,
        manualReason: 'invoice',
        note: 'Invoice 7/2026',
        hasQrCode: false,
        attempts: [],
        emails: [],
      }),
    )
    view()

    expect(await screen.findByText('Paid by invoice')).toBeDefined()
    expect(screen.getByText('Invoice 7/2026')).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Email of the order' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resend the QR code' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Cancel the order' })).toBeDefined()
  })

  it('lets an org with read access change nothing', async () => {
    state.tickets = 'read'
    view()

    expect(await screen.findByText('Ada Lovelace')).toBeDefined()
    for (const name of [
      /Save the name/,
      /Change the email/,
      /Resend/,
      /Cancel the order/,
      /Mark/,
    ]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })
})
