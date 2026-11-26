import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { type Draft, emptyDraft, loadDraft, saveDraft } from '../model/checkout'
import { CheckoutPage } from './checkout-page'
import { ids, offer } from './offer.fixture'

const api = vi.hoisted(() => ({
  offer: vi.fn(),
  place: vi.fn(),
  mine: vi.fn(),
  quote: vi.fn(),
  start: vi.fn(),
  leave: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('../api/shop', () => ({
  conventionOptions: () => ({
    queryKey: ['convention'],
    queryFn: () => ({ name: 'Convention A', timezone: 'Europe/Warsaw', logo: null }),
  }),
  editionOptions: () => ({
    queryKey: ['edition'],
    queryFn: () => ({ id: 'edition-1', slug: '2027', name: 'Convention A 2027' }),
  }),
  offerOptions: () => ({ queryKey: ['offer'], queryFn: api.offer }),
  offerKey: () => ['offer'],
  placeOrder: api.place,
  myOrdersOptions: (slug: string) => ({
    queryKey: ['my-orders', slug],
    queryFn: () => api.mine(slug) as unknown,
  }),
  discountQuoteOptions: (_: string, __: string, cart: object, discountCode: string) => ({
    queryKey: ['quote', cart, discountCode],
    queryFn: () => api.quote(cart, discountCode) as unknown,
  }),
  startPaymentAttempt: api.start,
}))
vi.mock('../model/leave', () => ({ leaveTo: api.leave }))
vi.mock('../../../shared/lib/notify', () => ({ notifyFailure: api.notify }))

const shop = '/conventions/convention-a/2027/shop'

const view = (search = `?ticketType=${ids.standard}`) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`${shop}/checkout${search}`]}>
          <Routes>
            <Route path="/conventions/:tenantSlug/:editionSlug/shop" element={<p>The shop</p>} />
            <Route path="/login" element={<p>The sign-in</p>} />
            <Route
              path="/conventions/:tenantSlug/:editionSlug/shop/checkout"
              element={<CheckoutPage />}
            />
            <Route
              path="/conventions/:tenantSlug/:editionSlug/shop/result/:orderId"
              element={<p>The result</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const account = {
  id: 'account-1',
  email: 'jan@example.test',
  firstName: 'Jan',
  lastName: 'Kowal',
}

/** A checkout the tab holds, as a buyer left it. */
const kept = (changes: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(ids.standard),
  holderName: 'Ada',
  ageBand: 'adult',
  email: 'ada@example.test',
  emailConfirmation: 'ada@example.test',
  answers: { [ids.city]: 'Poznań' },
  asVisitor: true,
  ...changes,
})

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const stepHeading = (name: string) => screen.findByRole('heading', { name, level: 2 })

/** Fills the first step as a visitor does and goes on. */
async function fillHolder() {
  press('Continue without an account')
  type(/name or nickname/, 'Ada')
  type('Age band', 'adult')
  type('Email address', 'ada@example.test')
  type('Repeat the email address', 'ada@example.test')
  type('City you travel from', 'Poznań')
  press('Next')
  await stepHeading('Add-ons')
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  window.sessionStorage.clear()
  useSession.setState({ status: 'ready', account: null })
  api.offer.mockReset().mockResolvedValue(offer())
  api.place.mockReset().mockResolvedValue({
    orderId: 'order-1',
    number: 'ABCDEFGHJK',
    status: 'awaiting-payment',
    totalMinor: 12000,
    resultToken: 'token-1',
  })
  api.quote.mockReset()
  api.mine.mockReset().mockResolvedValue([])
  api.start.mockReset().mockResolvedValue({ redirectUrl: 'https://provider.test/pay/1' })
  api.leave.mockReset()
  api.notify.mockReset()
})

afterEach(cleanup)

describe('CheckoutPage', () => {
  it('shows the steps with the current one marked, the ticket type and the running total', async () => {
    view()

    expect(await stepHeading('Ticket holder')).toBeDefined()
    expect(document.title).toBe('Checkout · OPOS')
    const steps = within(screen.getByRole('navigation', { name: 'Steps of the order' }))
    expect(steps.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1. Ticket holder',
      '2. Add-ons',
      '3. Merch',
      '4. Summary',
    ])
    expect(steps.getByText('1. Ticket holder').getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('Standard')).toBeDefined()
    expect(screen.getByText(/Total: .*120[.,]00/)).toBeDefined()
  })

  // Before the email is asked: go on without an account, or sign in or create one.
  it('offers a buyer who is not signed in to go on without an account, sign in or create one', async () => {
    view()
    await stepHeading('Ticket holder')

    expect(screen.queryByLabelText('Email address')).toBeNull()
    const back = encodeURIComponent(`${shop}/checkout?ticketType=${ids.standard}`)
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
      `/login?redirect=${back}`,
    )
    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe(
      `/register?redirect=${back}`,
    )

    press('Continue without an account')
    expect(screen.getByLabelText('Email address')).toBeDefined()
  })

  it('shows no error before the buyer tried to go on, then each field’s own, the first focused', async () => {
    view()
    await stepHeading('Ticket holder')
    press('Continue without an account')

    expect(screen.queryByText('Fill in this field.')).toBeNull()
    press('Next')

    // The name may stay empty, and the adult age band is chosen from the start.
    expect((await screen.findAllByText('Fill in this field.')).length).toBe(3)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Email address')))
    // Still on the first step.
    expect(screen.getByRole('heading', { name: 'Ticket holder', level: 2 })).toBeDefined()

    type(/name or nickname/, 'Ada')
    type('Age band', 'adult')
    type('Email address', 'ada@example.test')
    type('Repeat the email address', 'other@example.test')
    type('City you travel from', 'Poznań')
    press('Next')
    expect(await screen.findByText('Emails do not match.')).toBeDefined()
  })

  // Nobody has to be named, and most ticket holders are adults: the email alone is typed.
  it('marks the name as optional, starts with the adult age band and goes on with no name', async () => {
    view()
    await stepHeading('Ticket holder')
    press('Continue without an account')

    expect(screen.getByLabelText('Ticket holder’s name or nickname (optional)')).toBeDefined()
    expect(screen.getByLabelText<HTMLSelectElement>('Age band').value).toBe('adult')
    type('Email address', 'ada@example.test')
    type('Repeat the email address', 'ada@example.test')
    type('City you travel from', 'Poznań')
    press('Next')

    await stepHeading('Add-ons')
    expect(loadDraft('convention-a', '2027')).toMatchObject({ holderName: '', ageBand: 'adult' })
  })

  it('tells a child and a teen what their age band asks for', async () => {
    view()
    await stepHeading('Ticket holder')
    press('Continue without an account')

    type('Age band', 'child')
    expect(screen.getByText('A child enters only with a guardian present.')).toBeDefined()
    type('Age band', 'teen')
    expect(screen.getByText(/guardian’s consent on paper/)).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Download the guardian consent form' }).getAttribute('href'),
    ).toBe('https://convention.test/consent.pdf')
  })

  // A signed-in buyer's email is the account's, and the name is filled in from the account.
  it('asks a signed-in buyer no email and fills in the name from the account', async () => {
    useSession.setState({ status: 'ready', account: account as never })
    view()
    await stepHeading('Ticket holder')

    expect(screen.queryByRole('button', { name: 'Continue without an account' })).toBeNull()
    expect(screen.queryByLabelText('Email address')).toBeNull()
    expect(screen.getByText('jan@example.test')).toBeDefined()
    expect(screen.getByLabelText<HTMLInputElement>(/name or nickname/).value).toBe('Jan Kowal')
  })

  // C19: a sign-out clears the checkout, also one the tab did not see, as when it was asleep or
  // restored after its session ended. What an account entered is shown to nobody else.
  it('begins anew in a tab that kept the checkout of an account it no longer shows', async () => {
    const theirs = kept({
      step: 'summary',
      holderName: 'Jan Kowal',
      email: '',
      emailConfirmation: '',
      asVisitor: false,
    })
    saveDraft('convention-a', '2027', theirs, account.id)
    view()

    expect(await stepHeading('Ticket holder')).toBeDefined()
    press('Continue without an account')
    expect(screen.getByLabelText<HTMLInputElement>(/name or nickname/).value).toBe('')
    cleanup()

    saveDraft('convention-a', '2027', theirs, account.id)
    const other = { ...account, id: 'account-2', firstName: 'Ewa', lastName: 'Nowak' }
    useSession.setState({ status: 'ready', account: other as never })
    view()

    expect(await stepHeading('Ticket holder')).toBeDefined()
    expect(screen.getByLabelText<HTMLInputElement>(/name or nickname/).value).toBe('Ewa Nowak')
  })

  // C3: signing in keeps everything already entered, and the checkout is the account's from then.
  it('goes on with what a visitor entered once they sign in, as the account’s own', async () => {
    saveDraft('convention-a', '2027', kept({ step: 'add-ons' }))
    useSession.setState({ status: 'ready', account: account as never })
    view()

    expect(await stepHeading('Add-ons')).toBeDefined()
    fireEvent.click(screen.getByRole('checkbox', { name: /Sleeping room/ }))
    expect(loadDraft('convention-a', '2027')).toBeNull()
    expect(loadDraft('convention-a', '2027', undefined, account.id)).toMatchObject({
      holderName: 'Ada',
      addOnIds: [ids.room],
    })
  })

  // What the first step asks holds again when the order is placed: a checkout that reaches
  // the Summary without it goes back there, with the field marked, and places nothing.
  it('returns a buyer whose first step does not hold from the Summary, and places nothing', async () => {
    saveDraft(
      'convention-a',
      '2027',
      kept({
        step: 'summary',
        email: '',
        emailConfirmation: '',
        consentIds: [ids.terms],
        providerConsent: true,
      }),
    )
    view()
    await stepHeading('Summary')

    press('Order and pay')

    expect(await stepHeading('Ticket holder')).toBeDefined()
    expect(screen.getAllByText('Fill in this field.')).toHaveLength(2)
    expect(api.place).not.toHaveBeenCalled()
  })

  it('stops a signed-in buyer whose account email the provider cannot take, and says so', async () => {
    const long = `${'a'.repeat(39)}@example.test`
    useSession.setState({ status: 'ready', account: { ...account, email: long } as never })
    view()
    await stepHeading('Ticket holder')

    expect(screen.getByRole('alert').textContent).toMatch(/cannot take an email address as long/)
    type('Age band', 'adult')
    type('City you travel from', 'Poznań')
    press('Next')

    expect(screen.getByRole('heading', { name: 'Ticket holder', level: 2 })).toBeDefined()
  })

  it('names an age band with the years it covers', async () => {
    view()
    await stepHeading('Ticket holder')
    press('Continue without an account')

    const options = within(screen.getByLabelText('Age band')).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Choose',
      'Child (under 13)',
      'Teen (13 to 17)',
      'Adult (18 and over)',
    ])
  })

  it('updates the total at once with a supporter price, an add-on and merchandise', async () => {
    view()
    await stepHeading('Ticket holder')
    press('Continue without an account')

    type('Price', '20000')
    expect(screen.getByText(/Total: .*200[.,]00/)).toBeDefined()
    type('Price', '')
    type(/name or nickname/, 'Ada')
    type('Age band', 'adult')
    type('Email address', 'ada@example.test')
    type('Repeat the email address', 'ada@example.test')
    type('City you travel from', 'Poznań')
    press('Next')
    await stepHeading('Add-ons')

    // A headcount-only add-on says no place is reserved; a limited one, how many are left.
    expect(screen.getByText(/no place is reserved/)).toBeDefined()
    expect(screen.getByText(/3 places left\./)).toBeDefined()
    fireEvent.click(screen.getByRole('checkbox', { name: /Painting workshop/ }))
    expect(screen.getByText(/Total: .*160[.,]00/)).toBeDefined()

    press('Next')
    await stepHeading('Merch')
    const pin = within(screen.getByRole('heading', { name: 'Enamel pin' }).closest('li')!)
    fireEvent.change(pin.getByLabelText('Quantity of Enamel pin'), { target: { value: '2' } })
    fireEvent.click(pin.getByRole('button', { name: 'Add to the order' }))
    expect(screen.getByText(/Total: .*190[.,]00/)).toBeDefined()
    expect(pin.getByText('2 × Enamel pin')).toBeDefined()
  })

  it('offers the variants that exist, the unavailable one not selectable, and needs one chosen', async () => {
    saveDraft('convention-a', '2027', kept({ step: 'merch' }))
    view()
    await stepHeading('Merch')
    const shirt = within(screen.getByRole('heading', { name: 'T-shirt' }).closest('li')!)

    fireEvent.click(shirt.getByRole('button', { name: 'Add to the order' }))
    expect(shirt.getByText('Choose a variant first.')).toBeDefined()
    const large = shirt.getByRole<HTMLOptionElement>('option', { name: 'L (unavailable)' })
    expect(large.disabled).toBe(true)

    fireEvent.change(shirt.getByLabelText('Variant of T-shirt'), {
      target: { value: ids.shirtM },
    })
    fireEvent.click(shirt.getByRole('button', { name: 'Add to the order' }))
    expect(shirt.getByText('1 × T-shirt (M)')).toBeDefined()
    fireEvent.click(shirt.getByRole('button', { name: 'Remove T-shirt (M)' }))
    expect(shirt.queryByText('1 × T-shirt (M)')).toBeNull()
  })

  // Back keeps everything entered on later steps; a reload resumes on the same step.
  it('keeps the checkout in the tab: a reload resumes on the same step with the same data', async () => {
    view()
    await stepHeading('Ticket holder')
    await fillHolder()
    fireEvent.click(screen.getByRole('checkbox', { name: /Sleeping room/ }))

    cleanup()
    view()

    expect(await stepHeading('Add-ons')).toBeDefined()
    expect(
      screen.getByRole('checkbox', { name: /Sleeping room/ }).getAttribute('aria-checked'),
    ).toBe('true')
    press('Back')
    expect(screen.getByLabelText<HTMLInputElement>(/name or nickname/).value).toBe('Ada')
    expect(loadDraft('convention-a', '2027')).toMatchObject({ holderName: 'Ada', step: 'holder' })
  })

  it('places the order with the total the buyer saw and sends the buyer to the provider', async () => {
    saveDraft('convention-a', '2027', kept({ step: 'summary' }))
    view()
    await stepHeading('Summary')

    expect(screen.getByText('ada@example.test')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Order and pay' })).toBeDefined()
    // Nothing is placed without the required consents: the missing ones are marked.
    press('Order and pay')
    expect(screen.getAllByText('Accept this to place the order.')).toHaveLength(2)
    expect(api.place).not.toHaveBeenCalled()

    // "Select all required" ticks the edition's required consents, never an optional one, and
    // the provider's own only when its module allows it.
    press('Select all required')
    expect(screen.getByRole('checkbox', { name: /shop terms/ }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(screen.getByRole('checkbox', { name: /news/ }).getAttribute('aria-checked')).toBe(
      'false',
    )
    const provider = screen.getByRole('checkbox', { name: /terms of the provider/ })
    expect(provider.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(provider)
    press('Order and pay')

    await waitFor(() => expect(api.leave).toHaveBeenCalledWith('https://provider.test/pay/1'))
    const [at, body, signedIn] = api.place.mock.calls[0] as [object, object, boolean]
    expect(at).toEqual({ slug: 'convention-a', editionSlug: '2027', editionId: 'edition-1' })
    expect(signedIn).toBe(false)
    expect(body).toMatchObject({
      cart: { ticket: { ticketTypeId: ids.standard } },
      holderName: 'Ada',
      email: 'ada@example.test',
      consentIds: [ids.terms],
      providerConsentAccepted: true,
      expectedTotalMinor: 12000,
    })
    expect(api.start).toHaveBeenCalledWith(at, 'order-1', 'token-1', false)
    // The order is placed: the checkout is forgotten, and its result page opens with the token.
    expect(loadDraft('convention-a', '2027')).toBeNull()
    expect(window.sessionStorage.getItem('opos-order-result:order-1')).toBe('token-1')
  })

  // The provider's page takes a moment to open, and the checkout is still on the screen
  // meanwhile: its order is placed, and another press places no second one.
  it('places no second order while the browser leaves for the provider', async () => {
    saveDraft(
      'convention-a',
      '2027',
      kept({ step: 'summary', consentIds: [ids.terms], providerConsent: true }),
    )
    view()
    await stepHeading('Summary')

    press('Order and pay')
    await waitFor(() => expect(api.leave).toHaveBeenCalled())
    // The placing has ended; only the page that leaves is awaited.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    const order = screen.getByRole<HTMLButtonElement>('button', { name: 'Order and pay' })
    fireEvent.submit(order.closest('form')!)
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(api.place).toHaveBeenCalledTimes(1)
    expect(api.leave).toHaveBeenCalledTimes(1)
    expect(order.disabled).toBe(true)
  })

  // Back from the provider's page, a browser may show the checkout again out of its memory, as
  // it was left: its order is placed and its button stays off, so the order's result takes over.
  it('opens the result of the placed order once the browser brings the page back', async () => {
    const shown = (persisted: boolean) =>
      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }))
      })
    saveDraft(
      'convention-a',
      '2027',
      kept({ step: 'summary', consentIds: [ids.terms], providerConsent: true }),
    )
    view()
    await stepHeading('Summary')

    // A checkout brought back with no order placed goes on where it was.
    shown(true)
    expect(screen.getByRole('button', { name: 'Order and pay' })).toBeDefined()

    press('Order and pay')
    await waitFor(() => expect(api.leave).toHaveBeenCalled())
    // A page shown as it loads was not brought back.
    shown(false)
    expect(screen.queryByText('The result')).toBeNull()

    shown(true)
    expect(await screen.findByText('The result')).toBeDefined()
  })

  // docs/specs/0008-discount-codes.md, K1: a valid code appears as a line of its own, and the
  // total updates. The API alone knows a code's terms, so the Summary asks it for the price.
  it('takes a discount code at the Summary: its line, the new total, and the order placed with both', async () => {
    api.quote.mockResolvedValue({
      currency: 'PLN',
      lines: [
        {
          kind: 'ticket',
          ticketTypeId: ids.standard,
          name: 'Standard',
          variant: [],
          quantity: 1,
          unitAmountMinor: 12000,
          amountMinor: 12000,
        },
        {
          kind: 'discount',
          name: 'early10',
          variant: [],
          quantity: 1,
          unitAmountMinor: -1200,
          amountMinor: -1200,
        },
      ],
      totalMinor: 10800,
    })
    saveDraft('convention-a', '2027', kept({ step: 'summary' }))
    view()
    await stepHeading('Summary')

    type('Discount code', ' EARLY10 ')
    press('Apply the code')

    expect(await screen.findByRole('rowheader', { name: 'Discount code EARLY10' })).toBeDefined()
    expect(api.quote).toHaveBeenCalledWith(
      { ticket: { ticketTypeId: ids.standard }, addOnIds: [], items: [] },
      'EARLY10',
    )
    const total = screen.getByRole('rowheader', { name: 'Total due' }).closest('tr')!
    expect(within(total).getByText(/108[.,]00/)).toBeDefined()
    press('Select all required')
    fireEvent.click(screen.getByRole('checkbox', { name: /terms of the provider/ }))
    press('Order and pay')

    await waitFor(() => expect(api.place).toHaveBeenCalled())
    expect(api.place.mock.calls[0]![1]).toMatchObject({
      discountCode: 'EARLY10',
      expectedTotalMinor: 10800,
    })
  })

  // K4: the buyer is told only that the code cannot be used for this order.
  it('says one thing of a code that cannot be used, and places the order without it', async () => {
    api.quote.mockRejectedValue(new ORPCError('discount-code.refused', { status: 409 }))
    saveDraft('convention-a', '2027', kept({ step: 'summary' }))
    view()
    await stepHeading('Summary')

    type('Discount code', 'nobody-knows')
    press('Apply the code')

    expect(await screen.findByText('This code cannot be used for this order.')).toBeDefined()
    expect(screen.queryByRole('rowheader', { name: /Discount code/ })).toBeNull()
    press('Select all required')
    fireEvent.click(screen.getByRole('checkbox', { name: /terms of the provider/ }))
    press('Order and pay')

    await waitFor(() => expect(api.place).toHaveBeenCalled())
    const body = api.place.mock.calls[0]![1] as Record<string, unknown>
    expect(body).toMatchObject({ expectedTotalMinor: 12000 })
    expect(body).not.toHaveProperty('discountCode')
  })

  it('lets the buyer remove a code that was applied', async () => {
    api.quote.mockResolvedValue({ currency: 'PLN', lines: [], totalMinor: 10800 })
    saveDraft('convention-a', '2027', kept({ step: 'summary', discountCode: 'EARLY10' }))
    view()
    await stepHeading('Summary')
    await screen.findByText(/Code EARLY10 is applied/)

    press('Remove the code')

    await waitFor(() => expect(screen.queryByText(/Code EARLY10 is applied/)).toBeNull())
    expect(loadDraft('convention-a', '2027')).toMatchObject({ discountCode: '' })
  })

  // An order is never placed at a price the buyer did not see: not while the code is priced.
  it('places nothing while the shop still prices the code', async () => {
    let answer: (quote: object) => void = () => undefined
    api.quote.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    saveDraft(
      'convention-a',
      '2027',
      kept({
        step: 'summary',
        discountCode: 'EARLY10',
        consentIds: [ids.terms],
        providerConsent: true,
      }),
    )
    view()
    await stepHeading('Summary')

    const order = screen.getByRole<HTMLButtonElement>('button', { name: 'Order and pay' })
    expect(order.disabled).toBe(true)
    fireEvent.submit(order.closest('form')!)
    expect(api.place).not.toHaveBeenCalled()

    answer({ currency: 'PLN', lines: [], totalMinor: 10800 })
    await screen.findByText(/Code EARLY10 is applied/)
    expect(order.disabled).toBe(false)
  })

  // K7: used up after the buyer entered it, the order is not placed, and the code is marked.
  it('keeps the buyer at the Summary with the code marked when it was used up meanwhile', async () => {
    api.quote.mockResolvedValueOnce({ currency: 'PLN', lines: [], totalMinor: 10800 })
    api.quote.mockRejectedValue(new ORPCError('discount-code.refused', { status: 409 }))
    api.place.mockRejectedValue(
      new ORPCError('order.unavailable', { status: 409, data: { kind: 'discount-code' } }),
    )
    saveDraft(
      'convention-a',
      '2027',
      kept({
        step: 'summary',
        discountCode: 'LAST-USE',
        consentIds: [ids.terms],
        providerConsent: true,
      }),
    )
    view()
    await stepHeading('Summary')
    await screen.findByText(/Code LAST-USE is applied/)

    press('Order and pay')

    expect(await screen.findByText('This code cannot be used for this order.')).toBeDefined()
    expect(await stepHeading('Summary')).toBeDefined()
  })

  it('asks a teen’s buyer to acknowledge the guardian consent before the order is placed', async () => {
    saveDraft(
      'convention-a',
      '2027',
      kept({ step: 'summary', ageBand: 'teen', consentIds: [ids.terms], providerConsent: true }),
    )
    view()
    await stepHeading('Summary')

    press('Order and pay')
    expect(api.place).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /guardian’s consent on paper/ }))
    press('Order and pay')

    await waitFor(() => expect(api.place).toHaveBeenCalled())
    expect(api.place.mock.calls[0]![1]).toMatchObject({ guardianConsentAcknowledged: true })
  })

  it('reads "Order" for a total of zero and goes to the result with no payment step', async () => {
    const free = offer()
    free.ticketTypes[0]!.priceMinor = 0
    free.ticketTypes[0]!.supporterPrices = []
    api.offer.mockResolvedValue(free)
    api.place.mockResolvedValue({
      orderId: 'order-1',
      number: 'ABCDEFGHJK',
      status: 'paid',
      totalMinor: 0,
      resultToken: 'token-1',
    })
    saveDraft('convention-a', '2027', kept({ step: 'summary', consentIds: [ids.terms] }))
    view()
    await stepHeading('Summary')

    // No consent of the provider is asked where nothing is paid.
    expect(screen.queryByRole('checkbox', { name: /terms of the provider/ })).toBeNull()
    press('Order')

    expect(await screen.findByText('The result')).toBeDefined()
    expect(api.start).not.toHaveBeenCalled()
    expect(api.leave).not.toHaveBeenCalled()
  })

  it('returns the buyer to the step of what ran out, with it marked', async () => {
    api.place.mockRejectedValue(
      new ORPCError('order.unavailable', {
        status: 409,
        data: { kind: 'add-on', id: ids.workshop },
      }),
    )
    saveDraft(
      'convention-a',
      '2027',
      kept({
        step: 'summary',
        addOnIds: [ids.workshop],
        consentIds: [ids.terms],
        providerConsent: true,
      }),
    )
    view()
    await stepHeading('Summary')

    press('Order and pay')

    expect(await stepHeading('Add-ons')).toBeDefined()
    expect(screen.getByText('It ran out while you were ordering.')).toBeDefined()
    expect(api.leave).not.toHaveBeenCalled()
  })

  // O5 for the ticket type itself: nothing is placed, and the checkout says what ran out and
  // where another one is picked, instead of an empty order nothing can be done with.
  it('says that the ticket type is not on sale once it ran out, and offers no order to place', async () => {
    api.place.mockRejectedValue(
      new ORPCError('order.unavailable', {
        status: 409,
        data: { kind: 'ticket-type', id: ids.standard },
      }),
    )
    saveDraft(
      'convention-a',
      '2027',
      kept({ step: 'summary', consentIds: [ids.terms], providerConsent: true }),
    )
    view()
    await stepHeading('Summary')
    const gone = offer()
    gone.ticketTypes[0]!.state = 'sold-out'
    api.offer.mockResolvedValue(gone)

    press('Order and pay')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/This ticket type is not on sale now\./)
    expect(
      within(alert)
        .getByRole('link', { name: 'Choose another one in the shop.' })
        .getAttribute('href'),
    ).toBe(shop)
    // No total of nothing, and no button that would place it.
    expect(screen.queryByRole('rowheader', { name: 'Total due' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Order/ })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Summary', level: 2 })).toBeDefined()
  })

  it('tells at the Summary that something chosen ran out, and marks it on its step', async () => {
    const out = offer()
    out.addOns[0]!.soldOut = true
    api.offer.mockResolvedValue(out)
    saveDraft('convention-a', '2027', kept({ step: 'summary', addOnIds: [ids.workshop] }))
    view()
    await stepHeading('Summary')

    expect(screen.getByRole('alert').textContent).toMatch(
      /Something you chose is no longer available\./,
    )
    expect(screen.queryByRole('button', { name: /^Order/ })).toBeNull()
    press('Back')
    await stepHeading('Merch')
    press('Back')
    await stepHeading('Add-ons')
    expect(screen.getByText('It ran out while you were ordering.')).toBeDefined()
    fireEvent.click(screen.getByRole('checkbox', { name: /Painting workshop/ }))
    expect(screen.queryByText('It ran out while you were ordering.')).toBeNull()
    expect(screen.getByText(/Total: .*120[.,]00/)).toBeDefined()
  })

  // The tab keeps a checkout for days, and the shop changes meanwhile: what it no longer
  // offers is on no step, so the buyer could not take it out.
  it('takes out of a kept checkout what the shop no longer offers, and says so', async () => {
    const changed = offer({ addOns: offer().addOns.filter((addOn) => addOn.id !== ids.workshop) })
    changed.ticketTypes[0]!.addOnIds = [ids.room]
    api.offer.mockResolvedValue(changed)
    saveDraft(
      'convention-a',
      '2027',
      kept({ step: 'summary', addOnIds: [ids.workshop, ids.room], consentIds: ['gone'] }),
    )
    view()
    await stepHeading('Summary')

    expect(screen.getByText(/no longer offers something you had chosen/)).toBeDefined()
    expect(screen.getByText(/Total: .*120[.,]00/)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Order and pay' })).toBeDefined()
    expect(loadDraft('convention-a', '2027')).toMatchObject({
      addOnIds: [ids.room],
      consentIds: [],
    })
  })

  it('takes out what the shop stopped offering while the buyer was ordering', async () => {
    api.place.mockRejectedValueOnce(
      new ORPCError('order.unavailable', {
        status: 409,
        data: { kind: 'add-on', id: ids.workshop },
      }),
    )
    saveDraft(
      'convention-a',
      '2027',
      kept({
        step: 'summary',
        addOnIds: [ids.workshop],
        consentIds: [ids.terms],
        providerConsent: true,
      }),
    )
    view()
    await stepHeading('Summary')
    expect(screen.getByText(/Total: .*160[.,]00/)).toBeDefined()
    const changed = offer({ addOns: offer().addOns.filter((addOn) => addOn.id !== ids.workshop) })
    changed.ticketTypes[0]!.addOnIds = [ids.room]
    api.offer.mockResolvedValue(changed)

    press('Order and pay')

    expect(await screen.findByText(/no longer offers something you had chosen/)).toBeDefined()
    expect(screen.getByText(/Total: .*120[.,]00/)).toBeDefined()
    expect(loadDraft('convention-a', '2027')).toMatchObject({ addOnIds: [] })
  })

  // A total never changes silently: the buyer is shown the new one and confirms it.
  it('shows a new total and places nothing until the buyer confirms it', async () => {
    api.place.mockRejectedValueOnce(
      new ORPCError('order.total-changed', { status: 409, data: { totalMinor: 15000 } }),
    )
    saveDraft(
      'convention-a',
      '2027',
      kept({ step: 'summary', consentIds: [ids.terms], providerConsent: true }),
    )
    view()
    await stepHeading('Summary')
    const raised = offer()
    raised.ticketTypes[0]!.priceMinor = 15000
    api.offer.mockResolvedValue(raised)

    press('Order and pay')

    expect(await screen.findByText(/changed to .*150[.,]00/)).toBeDefined()
    expect(api.leave).not.toHaveBeenCalled()
    await screen.findByText(/Total: .*150[.,]00/)
    press('Order and pay')
    await waitFor(() => expect(api.leave).toHaveBeenCalled())
    expect(api.place.mock.calls[1]![1]).toMatchObject({ expectedTotalMinor: 15000 })
  })

  // With a discount code the total is the shop's own price of the cart: it is asked again, or
  // the buyer would confirm the old one for ever.
  it('asks the shop for the price with the code again when the total changed', async () => {
    api.quote.mockResolvedValueOnce({ currency: 'PLN', lines: [], totalMinor: 10800 })
    api.quote.mockResolvedValue({ currency: 'PLN', lines: [], totalMinor: 13500 })
    api.place.mockRejectedValueOnce(
      new ORPCError('order.total-changed', { status: 409, data: { totalMinor: 13500 } }),
    )
    saveDraft(
      'convention-a',
      '2027',
      kept({
        step: 'summary',
        discountCode: 'EARLY10',
        consentIds: [ids.terms],
        providerConsent: true,
      }),
    )
    view()
    await stepHeading('Summary')
    await screen.findByText(/Code EARLY10 is applied/)
    const due = () => screen.getByRole('rowheader', { name: 'Total due' }).closest('tr')!
    expect(within(due()).getByText(/108[.,]00/)).toBeDefined()

    press('Order and pay')

    expect(await screen.findByText(/changed to .*135[.,]00/)).toBeDefined()
    await waitFor(() => expect(within(due()).getByText(/135[.,]00/)).toBeDefined())
    expect(api.leave).not.toHaveBeenCalled()
    press('Order and pay')
    await waitFor(() => expect(api.leave).toHaveBeenCalled())
    expect(api.place.mock.calls[1]![1]).toMatchObject({
      discountCode: 'EARLY10',
      expectedTotalMinor: 13500,
    })
  })

  it('says so when the bot check failed, and lets the buyer try again', async () => {
    const failed = new ORPCError('bot-check.failed', { status: 403 })
    api.place.mockRejectedValueOnce(failed)
    saveDraft(
      'convention-a',
      '2027',
      kept({ step: 'summary', consentIds: [ids.terms], providerConsent: true }),
    )
    view()
    await stepHeading('Summary')

    press('Order and pay')

    await waitFor(() => expect(api.notify).toHaveBeenCalledWith(failed))
    expect(screen.getByRole('heading', { name: 'Summary', level: 2 })).toBeDefined()
    press('Order and pay')
    await waitFor(() => expect(api.leave).toHaveBeenCalled())
  })

  it('has three steps for an order of merchandise alone, and needs an item', async () => {
    view('?ticketType=none')

    expect(await stepHeading('Buyer')).toBeDefined()
    const steps = within(screen.getByRole('navigation', { name: 'Steps of the order' }))
    expect(steps.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1. Buyer',
      '2. Merch',
      '3. Summary',
    ])
    press('Continue without an account')
    // Never an age band or a custom field.
    expect(screen.queryByLabelText('Age band')).toBeNull()
    expect(screen.queryByLabelText('City you travel from')).toBeNull()
    // The buyer's name may stay empty too.
    expect(screen.getByLabelText('Your name or nickname (optional)')).toBeDefined()
    type('Email address', 'ada@example.test')
    type('Repeat the email address', 'ada@example.test')
    press('Next')
    await stepHeading('Merch')

    press('Next')
    expect(await screen.findByText('Add at least one item to order.')).toBeDefined()
    const pin = within(screen.getByRole('heading', { name: 'Enamel pin' }).closest('li')!)
    fireEvent.click(pin.getByRole('button', { name: 'Add to the order' }))
    press('Next')
    expect(await stepHeading('Summary')).toBeDefined()
    expect(screen.getByText(/picked up at the convention/)).toBeDefined()
  })

  // An order of merchandise alone is its items: once the shop offers none of those chosen, the
  // Summary has no order to show, and asks for an item as the Merch step does.
  it('offers no order of merchandise alone to place once the shop took out all of it', async () => {
    api.offer.mockResolvedValue(offer({ items: offer().items.filter(({ id }) => id !== ids.pin) }))
    const alone = kept({
      ticketTypeId: null,
      ageBand: null,
      answers: {},
      items: [{ variantId: ids.pinVariant, quantity: 1 }],
      step: 'summary',
    })
    saveDraft('convention-a', '2027', alone)
    view('?ticketType=none')
    await stepHeading('Summary')

    expect(screen.getByText(/no longer offers something you had chosen/)).toBeDefined()
    expect(screen.getByRole('alert').textContent).toBe('Add at least one item to order.')
    expect(screen.queryByRole('rowheader', { name: 'Total due' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Order/ })).toBeNull()
    press('Back')
    expect(await stepHeading('Merch')).toBeDefined()

    // With no merchandise left to offer there is no step to go back to: the shop is the way.
    cleanup()
    api.offer.mockResolvedValue(offer({ items: [], merchOnly: false }))
    saveDraft('convention-a', '2027', alone)
    view('?ticketType=none')
    await stepHeading('Summary')

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/Merchandise cannot be ordered without a ticket now\./)
    expect(
      within(alert).getByRole('link', { name: 'Choose a ticket type in the shop.' }),
    ).toBeDefined()
    expect(screen.queryByRole('rowheader', { name: 'Total due' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Order/ })).toBeNull()
  })

  // Picking another ticket type: the buyer says whether to keep the merchandise, and add-ons
  // the new one does not offer are removed, with a notice.
  it('asks what becomes of the merchandise when another ticket type is picked', async () => {
    const two = offer()
    two.ticketTypes[1]!.state = 'on-sale'
    api.offer.mockResolvedValue(two)
    saveDraft(
      'convention-a',
      '2027',
      kept({
        addOnIds: [ids.workshop, ids.room],
        items: [{ variantId: ids.pinVariant, quantity: 1 }],
      }),
    )
    view(`?ticketType=${ids.supporter}`)

    expect(await screen.findByText('Keep the merchandise you chose?')).toBeDefined()
    press('Keep the merchandise')

    expect(await stepHeading('Ticket holder')).toBeDefined()
    expect(screen.getByText(/it was removed: Painting workshop/)).toBeDefined()
    expect(loadDraft('convention-a', '2027')).toMatchObject({
      ticketTypeId: ids.supporter,
      addOnIds: [ids.room],
      holderName: 'Ada',
    })
  })

  it('goes back to the shop with nothing chosen, and when the shop is closed', async () => {
    view('')
    expect(await screen.findByText('The shop')).toBeDefined()

    cleanup()
    api.offer.mockResolvedValue(offer({ open: false, onSale: false }))
    view()
    expect(await screen.findByText('The shop')).toBeDefined()
  })
})

// docs/specs/0009-buyer-self-service.md, B1-B3 and B6: "Buy more" on a paid order of the account.
describe('CheckoutPage, adding to a paid order', () => {
  const paid = (changes: object = {}) => ({
    id: 'order-first',
    number: 'ABCDEFGHJK',
    status: 'paid',
    placedAt: '2027-05-01T10:00:00.000Z',
    holdEndsAt: null,
    payable: false,
    holderName: 'Ada Lovelace',
    edition: { id: 'edition-1', slug: '2027', name: 'Convention A 2027' },
    lines: [],
    totalMinor: 12000,
    currency: 'PLN',
    bought: { ticketTypeId: ids.standard, addOnIds: [ids.room], itemIds: [ids.pin] },
    ...changes,
  })
  const more = () => view('?extends=order-first')

  beforeEach(() => {
    useSession.setState({ status: 'ready', account: account as never })
    api.mine.mockResolvedValue([paid()])
  })

  it('asks nothing of the ticket holder again, and names the order it adds to', async () => {
    more()

    expect(await stepHeading('Add-ons')).toBeDefined()
    const steps = within(screen.getByRole('navigation', { name: 'Steps of the order' }))
    expect(steps.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1. Add-ons',
      '2. Merch',
      '3. Summary',
    ])
    expect(screen.getByText('More for the order ABCDEFGHJK')).toBeDefined()
    expect(screen.getByText(/Total: .*0[.,]00/)).toBeDefined()
    expect(screen.queryByLabelText(/name or nickname/)).toBeNull()
  })

  // B3: merchandise already bought is marked and can be ordered again; an add-on cannot.
  it('marks what was already ordered: an add-on cannot be taken again, merchandise can', async () => {
    more()
    await stepHeading('Add-ons')

    const room = screen.getByRole('checkbox', { name: /Sleeping room/ })
    expect(room.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Already ordered.')).toBeDefined()
    fireEvent.click(screen.getByRole('checkbox', { name: /Painting workshop/ }))
    expect(screen.getByText(/Total: .*40[.,]00/)).toBeDefined()
    press('Next')

    await stepHeading('Merch')
    const pin = screen
      .getAllByRole('listitem')
      .find((row) => within(row).queryByRole('heading', { name: 'Enamel pin' }))!
    expect(within(pin).getByText('Already ordered. You can order it again.')).toBeDefined()
    fireEvent.click(within(pin).getByRole('button', { name: 'Add to the order' }))
    expect(screen.getByText(/Total: .*55[.,]00/)).toBeDefined()
  })

  it('places an order that names the first one, with no ticket and the same ticket holder', async () => {
    saveDraft('convention-a', '2027', {
      ...kept({ step: 'summary', asVisitor: false }),
      ticketTypeId: null,
      ageBand: null,
      answers: {},
      addOnIds: [ids.workshop],
      extending: {
        orderId: 'order-first',
        number: 'ABCDEFGHJK',
        holderName: 'Ada Lovelace',
        ticketTypeId: ids.standard,
        addOnIds: [ids.room],
        itemIds: [ids.pin],
      },
    })
    more()
    await stepHeading('Summary')

    expect(screen.getByText(/joins the QR code of the order ABCDEFGHJK/)).toBeDefined()
    press('Select all required')
    fireEvent.click(screen.getByRole('checkbox', { name: /terms of the provider/ }))
    press('Order and pay')

    await waitFor(() => expect(api.place).toHaveBeenCalled())
    const [, body, signedIn] = api.place.mock.calls[0] as [object, Record<string, unknown>, boolean]
    expect(signedIn).toBe(true)
    expect(body).toMatchObject({
      extendsOrderId: 'order-first',
      cart: { ticket: null, addOnIds: [ids.workshop], items: [] },
      holderName: 'Ada Lovelace',
      ageBand: null,
      customFieldAnswers: [],
      expectedTotalMinor: 4000,
    })
    expect(body).not.toHaveProperty('email')
    // Its own checkout is forgotten; the edition's other one is not touched.
    await waitFor(() => expect(loadDraft('convention-a', '2027', 'order-first')).toBeNull())
  })

  it('places nothing with nothing chosen, and says so at the Summary', async () => {
    more()
    await stepHeading('Add-ons')
    press('Next')
    await stepHeading('Merch')
    press('Next')
    await stepHeading('Summary')

    press('Select all required')
    press('Order')

    expect(await screen.findByText('Choose at least one add-on or item to order.')).toBeDefined()
    expect(api.place).not.toHaveBeenCalled()
  })

  // One English wording, two Polish ones: the button is an imperative, the page's title a noun
  // phrase like the portal's other titles, so the title carries a context of its own.
  it('titles the page in Polish as a page, not as the button that leads to it', async () => {
    more()
    expect(await screen.findByRole('heading', { name: 'Buy more', level: 1 })).toBeDefined()

    // The tests run from the application's own directory.
    const catalog = readFileSync(resolve(process.cwd(), 'src/locales/pl.po'), 'utf8')
    expect(catalog).toContain(
      'msgctxt "page title"\nmsgid "Buy more"\nmsgstr "Dokupowanie do zamówienia"',
    )
    expect(catalog).toMatch(/\.tsx\nmsgid "Buy more"\nmsgstr "Dokup"/)
  })

  // B6: a visitor has no "Buy more".
  it('asks a visitor to sign in, and leads back to the shop for an order that cannot be added to', async () => {
    useSession.setState({ status: 'ready', account: null })
    more()
    expect(await screen.findByText('The sign-in')).toBeDefined()
    expect(api.mine).not.toHaveBeenCalled()
    cleanup()

    useSession.setState({ status: 'ready', account: account as never })
    api.mine.mockResolvedValue([paid({ status: 'awaiting-payment', bought: null })])
    more()
    expect(await screen.findByText('The shop')).toBeDefined()
    cleanup()

    api.mine.mockResolvedValue([paid({ edition: { id: 'edition-2', slug: '2026', name: 'Old' } })])
    more()
    expect(await screen.findByText('The shop')).toBeDefined()
  })
})
