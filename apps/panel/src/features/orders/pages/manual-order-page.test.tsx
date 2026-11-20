import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManualOrderPage } from './manual-order-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const createManual = vi.hoisted(() => vi.fn())

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
    queryFn: () => [
      {
        id: 'standard',
        name: 'Standard',
        hidden: false,
        saleStartsAt: '2020-01-01T00:00:00.000Z',
        saleEndsAt: '2099-01-01T00:00:00.000Z',
        tiers: [
          {
            amountMinor: 12000,
            startsAt: '2020-01-01T00:00:00.000Z',
            endsAt: '2099-01-01T00:00:00.000Z',
          },
        ],
        ageBands: ['teen', 'adult'],
        addOnIds: ['room'],
        merchandiseItemIds: ['pin'],
      },
    ],
  }),
  addOnsOptions: () => ({
    queryKey: ['catalog', 'add-ons'],
    queryFn: () => [{ id: 'room', name: 'Room', amountMinor: 2500, hidden: false }],
  }),
  merchandiseOptions: () => ({
    queryKey: ['catalog', 'merchandise'],
    queryFn: () => [
      {
        id: 'pin',
        name: 'Pin',
        amountMinor: 1500,
        hidden: false,
        axes: [],
        variants: [{ id: 'pin-one', valueIds: [], stock: 5, hidden: false }],
      },
    ],
  }),
  customFieldsOptions: () => ({
    queryKey: ['catalog', 'custom-fields'],
    queryFn: () => [{ id: 'city', label: 'City', isRequired: true, hidden: false }],
  }),
}))
vi.mock('../api/orders', () => ({
  ordersKey: () => ['orders'],
  createManualOrderOptions: () => ({ mutationFn: createManual }),
}))

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/orders/new']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/orders/new"
              element={<ManualOrderPage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/orders/:orderId"
              element={<p>The page of the order</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  createManual.mockResolvedValue({ id: 'order-9', number: 'MANUAL2222' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the new manual order page', () => {
  it('is for an org who may write alone', async () => {
    state.tickets = 'read'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
  })

  it('records a desk sale of what was chosen, at the prices in force, and opens its page', async () => {
    view()

    fireEvent.change(await screen.findByLabelText('Ticket type'), {
      target: { value: 'standard' },
    })
    fireEvent.click(await screen.findByRole('checkbox', { name: /Room/ }))
    fireEvent.change(screen.getByLabelText('Pin'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Age band'), { target: { value: 'adult' } })
    fireEvent.change(screen.getByLabelText(/Ticket holder’s name/), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Gdynia' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Cash' } })
    // 120 + 25 + 2 × 15.
    expect(screen.getByText('175 PLN')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Record the order' }))

    await waitFor(() =>
      expect(createManual.mock.calls[0]?.[0]).toEqual({
        params: { editionId: 'edition-2026' },
        body: {
          reason: 'desk',
          note: 'Cash',
          cart: {
            ticket: { ticketTypeId: 'standard' },
            addOnIds: ['room'],
            items: [{ variantId: 'pin-one', quantity: 2 }],
          },
          holderName: 'Ada',
          ageBand: 'adult',
          customFieldAnswers: [{ fieldId: 'city', answer: 'Gdynia' }],
        },
      }),
    )
    expect(await screen.findByText('The page of the order')).toBeDefined()
  })

  it('records merchandise alone for nothing when it is complimentary', async () => {
    view()

    fireEvent.change(await screen.findByLabelText('Reason'), {
      target: { value: 'complimentary' },
    })
    fireEvent.change(await screen.findByLabelText('Pin'), { target: { value: '1' } })
    // The line and the total alike.
    expect(screen.getAllByText('0 PLN')).toHaveLength(2)
    // No ticket, so no ticket holder to describe.
    expect(screen.queryByLabelText('Age band')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Record the order' }))

    await waitFor(() =>
      expect(createManual.mock.calls[0]?.[0]).toMatchObject({
        body: {
          reason: 'complimentary',
          note: null,
          cart: { ticket: null, addOnIds: [], items: [{ variantId: 'pin-one', quantity: 1 }] },
          ageBand: null,
        },
      }),
    )
  })

  it('says what a manual order is not, and records nothing while nothing is chosen', async () => {
    view()

    // A person who should hold a QR code ahead of the edition gets a 100% code instead.
    expect(await screen.findByText(/has no QR code and sends no email/)).toBeDefined()
    expect(screen.getByText(/100% discount code/)).toBeDefined()
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Record the order' }).disabled,
    ).toBe(true)
  })
})
