import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShopSettingsPage } from './shop-settings-page'

const state = vi.hoisted(() => ({ shop: 'none' }))
const readSeller = vi.hoisted(() => vi.fn())
const putSeller = vi.hoisted(() => vi.fn())
const readAccount = vi.hoisted(() => vi.fn())
const connect = vi.hoisted(() => vi.fn())
const disconnect = vi.hoisted(() => vi.fn())

vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: { shop: state.shop },
    api: {},
  }),
  useTenantTime: () => ({ format: (iso: string) => `at ${iso}` }),
}))
vi.mock('../api/shop', () => ({
  sellerOptions: () => ({ queryKey: ['shop', 'seller'], queryFn: readSeller }),
  putSellerOptions: () => ({ mutationFn: putSeller }),
  providerAccountOptions: () => ({ queryKey: ['shop', 'account'], queryFn: readAccount }),
  connectProviderAccountOptions: () => ({ mutationFn: connect }),
  disconnectProviderAccountOptions: () => ({ mutationFn: disconnect }),
  shopKey: () => ['shop'],
}))

const seller = {
  sellerName: 'Convention A Foundation',
  sellerAddress: 'ul. Przykładowa 1, 61-001 Poznań',
  sellerRegistrationNumber: 'KRS 0000000000',
  contactEmail: 'shop@convention-a.test',
  currency: 'PLN',
  complete: true,
}
const nothing = {
  sellerName: null,
  sellerAddress: null,
  sellerRegistrationNumber: null,
  contactEmail: null,
  currency: 'PLN',
  complete: false,
}
const account = {
  provider: 'fake',
  connectedAt: '2027-06-01T08:00:00.000Z',
  ready: true,
  missing: [],
}

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <ShopSettingsPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const section = (name: string) =>
  within(screen.getByRole('heading', { name, level: 2 }).closest('section')!)
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.shop = 'none'
  readSeller.mockReset().mockResolvedValue(nothing)
  putSeller
    .mockReset()
    .mockImplementation(({ body }: { body: object }) =>
      Promise.resolve({ ...body, currency: 'PLN', complete: true }),
    )
  readAccount.mockReset().mockResolvedValue({ account: null, providers: ['fake'], callsFrom: null })
  connect.mockReset().mockResolvedValue({ account, providers: ['fake'], callsFrom: null })
  disconnect.mockReset().mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('ShopSettingsPage', () => {
  it('is closed to a member without the shop, and asks the API nothing', () => {
    view()

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readSeller).not.toHaveBeenCalled()
    expect(readAccount).not.toHaveBeenCalled()
  })

  it('names itself, and says what the details that are not set keep closed', async () => {
    state.shop = 'write'
    view()

    expect(await screen.findByText(/The details are incomplete/)).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Shop', level: 1 })).toBeDefined()
    expect(document.title).toBe('Shop · Convention A · OPOS panel')
    expect(screen.getByLabelText<HTMLInputElement>('Currency').value).toBe('PLN')
  })

  it("saves the seller's details, an emptied field as a part cleared", async () => {
    state.shop = 'write'
    readSeller.mockResolvedValue(seller)
    view()
    await screen.findByDisplayValue('Convention A Foundation')
    expect(screen.getByText('The details are complete.')).toBeDefined()

    type('Name of the seller', ' Convention A Association ')
    type('Register or tax number', '')
    fireEvent.click(screen.getByRole('button', { name: 'Save the details' }))

    await vi.waitFor(() => expect(putSeller).toHaveBeenCalledTimes(1))
    expect(putSeller.mock.calls[0]?.[0]).toEqual({
      body: {
        sellerName: 'Convention A Association',
        sellerAddress: seller.sellerAddress,
        sellerRegistrationNumber: null,
        contactEmail: seller.contactEmail,
      },
    })
  })

  it('tells a contact that is no email address beside its field, and sends nothing', async () => {
    state.shop = 'write'
    view()
    await screen.findByText(/The details are incomplete/)

    type('Contact email', 'shop')
    fireEvent.click(screen.getByRole('button', { name: 'Save the details' }))

    expect(
      await screen.findByText('Enter an email address, or leave the field empty.'),
    ).toBeDefined()
    expect(putSeller).not.toHaveBeenCalled()
  })

  it('shows everything to a member who reads the shop, with nothing to change it', async () => {
    state.shop = 'read'
    readSeller.mockResolvedValue(seller)
    readAccount.mockResolvedValue({ account, providers: ['fake'], callsFrom: null })
    view()

    await screen.findByDisplayValue('Convention A Foundation')
    expect(await screen.findByText('Ready to sell')).toBeDefined()
    expect(screen.getByLabelText('Name of the seller').matches(':disabled')).toBe(true)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText('Account')).toBeNull()
  })

  it('connects an account with the credentials its provider asks for', async () => {
    state.shop = 'write'
    readAccount
      .mockResolvedValueOnce({ account: null, providers: ['fake'], callsFrom: null })
      .mockResolvedValue({ account, providers: ['fake'], callsFrom: null })
    view()
    const provider = section('Payment provider account')
    expect(await provider.findByText('No payment provider account is connected.')).toBeDefined()
    const button = provider.getByRole('button', { name: 'Connect the account' })
    expect(button.hasAttribute('disabled')).toBe(true)

    type('Account', 'demo')
    fireEvent.click(button)

    expect(await provider.findByText('Ready to sell')).toBeDefined()
    expect(connect.mock.calls[0]?.[0]).toEqual({
      body: { provider: 'fake', credentials: { account: 'demo' } },
    })
    // The credentials are given and never shown: the field is empty again.
    expect(screen.getByLabelText<HTMLInputElement>('Account').value).toBe('')
    expect(provider.getByText('at 2027-06-01T08:00:00.000Z')).toBeDefined()
  })

  it('asks Przelewy24 for its identifiers and keys, and the org for its two answers', async () => {
    state.shop = 'write'
    const around = { providers: ['fake', 'przelewy24'], callsFrom: '203.0.113.7' }
    readAccount
      .mockResolvedValueOnce({ account: null, ...around })
      .mockResolvedValue({ account, ...around })
    connect.mockResolvedValue({ account, ...around })
    view()
    const provider = section('Payment provider account')
    fireEvent.change(await provider.findByLabelText('Provider'), {
      target: { value: 'przelewy24' },
    })

    // Przelewy24 answers only to the addresses entered in its panel: the org reads which.
    expect(provider.getByText(/203\.0\.113\.7/)).toBeDefined()
    // The identifiers are shown as typed, the keys are not.
    expect(screen.getByLabelText<HTMLInputElement>('Merchant ID').type).toBe('text')
    expect(screen.getByLabelText<HTMLInputElement>('CRC key').type).toBe('password')
    type('Merchant ID', '123456')
    type('Point of sale ID', '123456')
    type('CRC key', 'crc-key')
    type('API key', 'api-key')
    fireEvent.click(provider.getByRole('checkbox', { name: /abandoned payment is off/ }))
    fireEvent.click(provider.getByRole('button', { name: 'Connect the account' }))

    await provider.findByText('Ready to sell')
    expect(connect.mock.calls[0]?.[0]).toEqual({
      body: {
        provider: 'przelewy24',
        credentials: {
          merchantId: '123456',
          posId: '123456',
          crc: 'crc-key',
          apiKey: 'api-key',
          sandbox: 'false',
          abandonedPaymentEmailOff: 'true',
        },
      },
    })
  })

  it('tells where the address to enter comes from when the environment has none set', async () => {
    state.shop = 'write'
    readAccount.mockResolvedValue({ account: null, providers: ['przelewy24'], callsFrom: null })
    view()
    const provider = section('Payment provider account')

    expect(await provider.findByText(/Ask the OPOS administrators/)).toBeDefined()
  })

  it('says what an account that is not ready misses', async () => {
    state.shop = 'read'
    readAccount.mockResolvedValue({
      account: { ...account, ready: false, missing: ['fake.not-ready', 'p24.unknown'] },
      providers: ['fake'],
    })
    view()
    const provider = section('Payment provider account')

    expect(await provider.findByText('Not ready to sell')).toBeDefined()
    expect(provider.getByText('The fake provider reports this account as not ready.')).toBeDefined()
    // A condition this panel has no words for yet is told as a sentence that carries its code.
    expect(
      provider.getByText(
        'The provider reports a condition this panel cannot describe yet (code: p24.unknown).',
      ),
    ).toBeDefined()
  })

  // Przelewy24's access test checks the point of sale and the API key alone.
  it('says of a ready Przelewy24 account what only the first payment confirms', async () => {
    state.shop = 'read'
    const p24 = { ...account, provider: 'przelewy24' }
    const note =
      'The CRC key and the merchant ID are confirmed only by the first payment a buyer starts. You can correct the credentials of this same account at any time.'
    readAccount.mockResolvedValue({ account: p24, providers: ['przelewy24'], callsFrom: null })
    const { unmount } = view()

    expect(await section('Payment provider account').findByText(note)).toBeDefined()

    // An account that is not ready says what it misses, and nothing of a payment yet.
    unmount()
    readAccount.mockResolvedValue({
      account: { ...p24, ready: false, missing: ['przelewy24.abandoned-payment-email-on'] },
      providers: ['przelewy24'],
      callsFrom: null,
    })
    view()
    await section('Payment provider account').findByText('Not ready to sell')
    expect(screen.queryByText(note)).toBeNull()
  })

  it('says nothing of the kind of an account whose provider checks all it is given', async () => {
    state.shop = 'read'
    readAccount.mockResolvedValue({ account, providers: ['fake'], callsFrom: null })
    view()

    await section('Payment provider account').findByText('Ready to sell')
    expect(screen.queryByText(/confirmed only by the first payment/)).toBeNull()
  })

  it('offers no account to connect where the environment has no provider', async () => {
    state.shop = 'write'
    readAccount.mockResolvedValue({ account: null, providers: [] })
    view()
    const provider = section('Payment provider account')

    expect(
      await provider.findByText('No payment provider can be connected in this environment yet.'),
    ).toBeDefined()
    expect(provider.queryByRole('button')).toBeNull()
  })

  it('asks in a modal before new credentials take the place of the stored ones', async () => {
    state.shop = 'write'
    readAccount.mockResolvedValue({ account, providers: ['fake'], callsFrom: null })
    view()
    const provider = section('Payment provider account')
    await provider.findByText('Ready to sell')

    type('Account', 'other')
    fireEvent.click(provider.getByRole('button', { name: 'Replace the credentials' }))
    const dialog = screen.getByRole('alertdialog', {
      name: 'Replace the credentials of the payment provider account?',
    })
    expect(dialog.textContent).toContain('This action cannot be undone.')
    expect(connect).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace the credentials' }))

    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1))
    expect(connect.mock.calls[0]?.[0]).toEqual({
      body: { provider: 'fake', credentials: { account: 'other' } },
    })
  })

  it('disconnects the account once its modal is confirmed', async () => {
    state.shop = 'write'
    readAccount
      .mockResolvedValueOnce({ account, providers: ['fake'], callsFrom: null })
      .mockResolvedValue({ account: null, providers: ['fake'], callsFrom: null })
    view()
    const provider = section('Payment provider account')
    await provider.findByText('Ready to sell')

    fireEvent.click(provider.getByRole('button', { name: 'Disconnect the account' }))
    const dialog = screen.getByRole('alertdialog', {
      name: 'Disconnect the payment provider account of Convention A?',
    })
    expect(dialog.textContent).toContain('This action cannot be undone.')
    expect(disconnect).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect the account' }))

    expect(await provider.findByText('No payment provider account is connected.')).toBeDefined()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
