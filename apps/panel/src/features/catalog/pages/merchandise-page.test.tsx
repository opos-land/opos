import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MerchandisePage } from './merchandise-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readShop = vi.hoisted(() => vi.fn())
const updateShop = vi.hoisted(() => vi.fn())
const readItems = vi.hoisted(() => vi.fn())
const updateItem = vi.hoisted(() => vi.fn())

vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: {
      edition: () => ({ program: 'none', websiteContent: 'none', tickets: state.tickets }),
    },
    api: {},
  }),
  useTenantTime: () => ({
    timeZone: 'UTC',
    toInput: (iso: string) => iso.slice(0, 16),
    fromInput: (value: string) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00.000Z` : null,
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
vi.mock('../../shop', () => ({
  editionShopOptions: () => ({ queryKey: ['shop', 'edition'], queryFn: readShop }),
  updateEditionShopOptions: () => ({ mutationFn: updateShop }),
}))
vi.mock('../api/catalog', () => ({
  merchandiseOptions: () => ({ queryKey: ['catalog', 'merchandise'], queryFn: readItems }),
  updateItemOptions: () => ({ mutationFn: updateItem }),
  catalogKey: () => ['catalog'],
}))

const shop = (fields: object = {}) => ({
  open: false,
  openedAt: null,
  faqUrl: null,
  ageBands: null,
  guardianConsentFormUrl: null,
  merchPreorderDeadline: null,
  merchOnlyEnabled: false,
  salesClosedMessage: null,
  pickupInformation: null,
  conditions: {},
  ...fields,
})
const variant = (id: string, stock: number | null) => ({ id, valueIds: [], stock, hidden: false })
const item = (position: number, fields: object = {}) => ({
  id: `item-${position}`,
  editionId: 'edition-2026',
  name: `Item ${position}`,
  description: '',
  amountMinor: 8000,
  perOrderLimit: 5,
  picturesIllustrative: false,
  position,
  hidden: false,
  axes: [],
  variants: [variant(`variant-${position}`, 10)],
  pictures: [],
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/merchandise']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/merchandise"
              element={<MerchandisePage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const field = (label: string | RegExp) => screen.getByLabelText<HTMLInputElement>(label)
const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr')!
const DEADLINE = 'Pre-order deadline'
const MERCH_ONLY = 'Orders of merchandise alone'

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  readShop.mockResolvedValue(shop())
  readItems.mockResolvedValue([])
  updateShop.mockImplementation(({ body }: { body: object }) => Promise.resolve(shop(body)))
  updateItem.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the merchandise page', () => {
  it('shows nothing to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readItems).not.toHaveBeenCalled()
  })

  it('shows the deadline in the time of the convention, and whether merch-only orders are on', async () => {
    readShop.mockResolvedValue(
      shop({ merchPreorderDeadline: '2027-05-01T21:59:00.000Z', merchOnlyEnabled: true }),
    )

    view()

    await waitFor(() => expect(field(DEADLINE).value).toBe('2027-05-01T21:59'))
    expect(field(MERCH_ONLY).value).toBe('on')
  })

  it('saves the deadline as a moment together with merch-only orders, and clears it when emptied', async () => {
    view()
    await screen.findByLabelText(DEADLINE)

    fireEvent.change(field(DEADLINE), { target: { value: '2027-05-01T22:00' } })
    fireEvent.change(field(MERCH_ONLY), { target: { value: 'on' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save how merchandise sells' }))
    await waitFor(() => expect(updateShop).toHaveBeenCalledTimes(1))
    expect(updateShop.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026' },
      body: {
        merchPreorderDeadline: '2027-05-01T22:00:00.000Z',
        merchOnlyEnabled: true,
        pickupInformation: null,
      },
    })

    fireEvent.change(field(DEADLINE), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save how merchandise sells' }))
    await waitFor(() => expect(updateShop).toHaveBeenCalledTimes(2))
    expect(updateShop.mock.calls[1]![0]).toMatchObject({ body: { merchPreorderDeadline: null } })
  })

  // docs/specs/0009-buyer-self-service.md, K7: the edition tells where and when merchandise is
  // handed over, and the page of an order shows it to the buyer.
  it('shows the pick-up information, saves what the org writes and clears it when emptied', async () => {
    readShop.mockResolvedValue(shop({ pickupInformation: 'At the desk in hall A.' }))
    view()
    const pickUp = await screen.findByLabelText<HTMLTextAreaElement>('Pick-up information')
    expect(pickUp.value).toBe('At the desk in hall A.')

    fireEvent.change(pickUp, { target: { value: ' At the desk in hall B, from 10 to 18. ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save how merchandise sells' }))
    await waitFor(() => expect(updateShop).toHaveBeenCalledTimes(1))
    expect(updateShop.mock.calls[0]![0]).toMatchObject({
      body: { pickupInformation: 'At the desk in hall B, from 10 to 18.' },
    })

    fireEvent.change(pickUp, { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save how merchandise sells' }))
    await waitFor(() => expect(updateShop).toHaveBeenCalledTimes(2))
    expect(updateShop.mock.calls[1]![0]).toMatchObject({ body: { pickupInformation: null } })
  })

  it('lists each item with its price and how many of its variants are out of stock', async () => {
    readItems.mockResolvedValue([
      item(1, {
        name: 'T-shirt',
        variants: [variant('a', 0), variant('b', 5), variant('c', null)],
      }),
      item(2, { name: 'Mug', hidden: true, amountMinor: 3550 }),
      item(3, { name: 'Poster', variants: [] }),
    ])

    view()

    const shirt = within(await waitFor(() => rowOf('T-shirt')))
    expect(shirt.getByText(/80\.00/)).toBeDefined()
    expect(shirt.getByText('Existing: 3, out of stock: 1')).toBeDefined()
    expect(within(rowOf('Mug')).getByText('Hidden from the shop')).toBeDefined()
    expect(within(rowOf('Mug')).getByText(/35\.50/)).toBeDefined()
    expect(within(rowOf('Poster')).getByText('None yet: the item cannot be bought')).toBeDefined()
    expect(screen.getByRole('link', { name: 'T-shirt' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/merchandise/item-1',
    )
  })

  it('says that merchandise is picked up at the edition, and promises no shipping', async () => {
    view()

    expect(
      await screen.findByText(/picked up at the edition: the shop promises no shipping/),
    ).toBeDefined()
  })

  it('moves and hides an item from the list itself', async () => {
    readItems.mockResolvedValue([item(1), item(2)])
    view()
    const second = within(await waitFor(() => rowOf('Item 2')))

    fireEvent.click(second.getByRole('button', { name: 'Move up' }))
    fireEvent.click(second.getByRole('button', { name: 'Hide from the shop' }))

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(2))
    expect(updateItem.mock.calls.map(([call]) => call as object)).toEqual([
      { params: { editionId: 'edition-2026', itemId: 'item-2' }, body: { position: 1 } },
      { params: { editionId: 'edition-2026', itemId: 'item-2' }, body: { hidden: true } },
    ])
  })

  it('leads a writer to a new item, and lets a reader change nothing', async () => {
    readItems.mockResolvedValue([item(1)])
    view()
    expect((await screen.findByRole('link', { name: 'New item' })).getAttribute('href')).toBe(
      '/convention-a/editions/2026/merchandise/new',
    )
    cleanup()

    state.tickets = 'read'
    view()
    await waitFor(() => rowOf('Item 1'))
    expect(screen.queryByRole('link', { name: 'New item' })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(field(DEADLINE).matches(':disabled')).toBe(true)
  })
})
