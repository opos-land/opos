import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ids, offer } from './offer.fixture'
import { ShopPage } from './shop-page'

const api = vi.hoisted(() => ({ offer: vi.fn() }))

vi.mock('../api/shop', () => ({
  offerOptions: () => ({ queryKey: ['offer'], queryFn: api.offer }),
}))

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/conventions/convention-a/2027/shop']}>
          <Routes>
            <Route path="/conventions/:tenantSlug/:editionSlug/shop" element={<ShopPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  api.offer.mockReset().mockResolvedValue(offer())
})

afterEach(cleanup)

describe('ShopPage', () => {
  it('shows each ticket type with its price in force and its short description', async () => {
    view()

    const standard = (await screen.findByRole('heading', { name: 'Standard' })).closest('li')!
    expect(document.title).toBe('Shop · OPOS')
    expect(within(standard).getByText('All three days.')).toBeDefined()
    // A gross amount with its currency.
    expect(within(standard).getByText(/120[.,]00/).textContent).toMatch(/PLN|zł/)
    expect(
      within(standard).getByRole('link', { name: 'Choose Standard' }).getAttribute('href'),
    ).toBe(`/conventions/convention-a/2027/shop/checkout?ticketType=${ids.standard}`)
    expect(screen.getByText('Every price is a gross amount.')).toBeDefined()
  })

  it.each([
    ['sold-out', 'Sold out'],
    ['not-yet', 'Not yet on sale'],
    ['closed', 'Sales closed'],
  ] as const)('shows a ticket type that is %s as "%s", and not selectable', async (state, text) => {
    const shown = offer()
    shown.ticketTypes[1]!.state = state
    api.offer.mockResolvedValue(shown)
    view()

    const supporter = (await screen.findByRole('heading', { name: 'Supporter' })).closest('li')!
    expect(within(supporter).getByText(text)).toBeDefined()
    expect(within(supporter).queryByRole('link')).toBeNull()
  })

  it('offers an order of merchandise alone while such orders are on', async () => {
    view()

    expect(
      (await screen.findByRole('link', { name: 'Order merchandise' })).getAttribute('href'),
    ).toBe('/conventions/convention-a/2027/shop/checkout?ticketType=none')

    cleanup()
    api.offer.mockResolvedValue(offer({ merchOnly: false }))
    view()
    await screen.findByRole('heading', { name: 'Standard' })
    expect(screen.queryByRole('link', { name: 'Order merchandise' })).toBeNull()
  })

  it.each([
    ['a closed shop', { open: false, onSale: false }],
    ['a shop with nothing on sale', { onSale: false }],
  ])('shows the org’s message instead of products for %s', async (_, changes) => {
    api.offer.mockResolvedValue(offer(changes))
    view()

    expect(await screen.findByText('See you next year.')).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Standard' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Choose/ })).toBeNull()
  })

  it('says sales are closed when the org wrote no message of its own', async () => {
    api.offer.mockResolvedValue(offer({ open: false, onSale: false, salesClosedMessage: null }))
    view()

    expect(await screen.findByText('Sales are closed for now.')).toBeDefined()
  })

  it('names the payment methods, the seller, the documents, the FAQ and the provider’s terms', async () => {
    view()

    expect(
      await screen.findByText('Payment methods: BLIK, bank transfer, payment card'),
    ).toBeDefined()
    expect(screen.getByText('Seller Ltd')).toBeDefined()
    expect(screen.getByText('KRS 0000000000')).toBeDefined()
    expect(screen.getByRole('link', { name: 'shop@seller.test' }).getAttribute('href')).toBe(
      'mailto:shop@seller.test',
    )
    expect(screen.getByRole('link', { name: 'Shop terms' }).getAttribute('href')).toMatch(
      new RegExp(`/public/tenants/convention-a/document-versions/${ids.termsVersion}$`),
    )
    expect(
      screen.getByRole('link', { name: 'Frequently asked questions' }).getAttribute('href'),
    ).toBe('https://convention.test/faq')
    expect(screen.getByRole('link', { name: 'Provider terms' }).getAttribute('href')).toBe(
      'https://provider.test/terms',
    )
  })

  // The shop never shows how much stock or capacity is left.
  it('shows no count of what is left', async () => {
    view()

    await screen.findByRole('heading', { name: 'Standard' })
    expect(document.body.textContent).not.toMatch(/\bleft\b|\bremaining\b/i)
  })

  it('is an unknown address for an edition that is not published', async () => {
    api.offer.mockRejectedValue(new ORPCError('request.not-found', { status: 404 }))
    view()

    expect(await screen.findByText(/not found|does not exist|Nothing here/i)).toBeDefined()
  })
})
