import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewDiscountCodePage } from './new-discount-code-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readCodes = vi.hoisted(() => vi.fn())
const createCode = vi.hoisted(() => vi.fn())
const updateCode = vi.hoisted(() => vi.fn())
const removeCode = vi.hoisted(() => vi.fn())

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
  useTenantTime: () => ({
    timeZone: 'Europe/Warsaw',
    format: (iso: string) => iso.slice(0, 10),
    range: (from: string, until: string) => `${from.slice(0, 10)} to ${until.slice(0, 10)}`,
    toInput: (iso: string) => iso.slice(0, 16),
    fromInput: (value: string) => (value ? `${value}:00.000Z` : null),
  }),
}))
vi.mock('../../editions', () => ({
  useEditionBySlug: () => ({
    isPending: false,
    isError: false,
    error: null,
    edition: {
      id: 'edition-2026',
      slug: '2026',
      name: 'Edition 2026',
      startsAt: '2099-07-01T08:00:00.000Z',
      endsAt: '2099-07-03T18:00:00.000Z',
    },
  }),
}))
vi.mock('../../catalog', () => ({
  useMoney: () => ({
    currency: 'PLN',
    format: (minor: number) => `${(minor / 100).toFixed(2)} PLN`,
    toInput: (minor: number) => (minor / 100).toFixed(2),
    parse: (text: string) =>
      /^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text.trim()) * 100) : null,
  }),
  ticketTypesOptions: () => ({
    queryKey: ['catalog', 'ticket-types'],
    queryFn: () => [
      { id: 'standard', name: 'Standard', discountsExcluded: false },
      { id: 'supporter', name: 'Supporter', discountsExcluded: true },
    ],
  }),
  addOnsOptions: () => ({
    queryKey: ['catalog', 'add-ons'],
    queryFn: () => [{ id: 'room', name: 'Sleeping room' }],
  }),
  merchandiseOptions: () => ({
    queryKey: ['catalog', 'merchandise'],
    queryFn: () => [{ id: 'shirt', name: 'T-shirt' }],
  }),
}))
vi.mock('../api/discount-codes', () => ({
  discountCodesOptions: () => ({ queryKey: ['discount-codes', 'list'], queryFn: readCodes }),
  createDiscountCodeOptions: () => ({ mutationFn: createCode }),
  updateDiscountCodeOptions: () => ({ mutationFn: updateCode }),
  removeDiscountCodeOptions: () => ({ mutationFn: removeCode }),
  discountCodesKey: () => ['discount-codes'],
}))

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/discount-codes/new']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/discount-codes/new"
              element={<NewDiscountCodePage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/discount-codes"
              element={<p>the list of discount codes</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const field = (label: string | RegExp) => screen.getByLabelText<HTMLInputElement>(label)
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(field(label), { target: { value } })
const tick = (name: string | RegExp) => fireEvent.click(screen.getByRole('checkbox', { name }))
/** The form is there once the edition's catalog is read. */
const ready = () => screen.findByRole('checkbox', { name: 'Standard' })

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  readCodes.mockResolvedValue([])
  for (const mock of [createCode, updateCode, removeCode]) mock.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// docs/specs/0008-discount-codes.md, Screens: the form of D1-D4, on the page that adds a code.
describe('the page of a new discount code', () => {
  it('is closed to a member who only reads the tickets of the edition', async () => {
    state.tickets = 'read'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByLabelText('Code')).toBeNull()
  })

  it('names itself and links back to the discount codes', async () => {
    view()
    await ready()

    expect(screen.getByRole('heading', { name: 'New discount code', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'All discount codes' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/discount-codes',
    )
  })

  it('adds a percent code for what the org ticks, valid until the edition ends unless changed', async () => {
    view()
    await ready()

    // The window is filled in: an org changes it only when the code should run shorter.
    expect(field('Valid until').value).toBe('2099-07-03T18:00')
    expect(field('Valid from').value).not.toBe('')
    type('Code', 'Early-10')
    type('Percent off', '10')
    type('Usage limit', '50')
    type('Valid from', '2099-01-01T10:00')
    tick('Standard')
    tick('T-shirt')
    fireEvent.click(screen.getByRole('button', { name: 'Add the code' }))

    await waitFor(() => expect(createCode).toHaveBeenCalledTimes(1))
    expect(createCode.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026' },
      body: {
        code: 'Early-10',
        kind: 'percent',
        percent: 10,
        usageLimit: 50,
        validFrom: '2099-01-01T10:00:00.000Z',
        validUntil: '2099-07-03T18:00:00.000Z',
        ticketTypeIds: ['standard'],
        addOnIds: [],
        itemIds: ['shirt'],
      },
    })
    // The member is led back to the list, where the new code stands.
    expect(await screen.findByText('the list of discount codes')).toBeDefined()
  })

  it('asks for an amount of an amount code alone', async () => {
    view()
    await ready()

    expect(screen.queryByLabelText(/^Amount off/)).toBeNull()
    type('Kind', 'amount')

    expect(field(/^Amount off/)).toBeDefined()
    expect(screen.queryByLabelText('Percent off')).toBeNull()
  })

  it('names what is wrong beside its field, and sends nothing', async () => {
    view()
    await ready()

    type('Code', 'x')
    type('Percent off', '150')
    fireEvent.click(screen.getByRole('button', { name: 'Add the code' }))

    expect(await screen.findByText('Enter 4 to 40 letters, digits and hyphens.')).toBeDefined()
    expect(screen.getByText('Enter a whole number from 1 to 100.')).toBeDefined()
    expect(screen.getByText('Choose at least one thing the code applies to.')).toBeDefined()
    expect(field('Code').getAttribute('aria-invalid')).toBe('true')
    expect(createCode).not.toHaveBeenCalled()
  })

  // D2: a code never applies to a ticket type excluded from discounts.
  it('offers no ticket type excluded from discounts, and says why', async () => {
    view()
    await ready()

    const excluded = await screen.findByRole('checkbox', { name: 'Supporter' })
    expect(excluded.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(excluded)
    expect(excluded.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Excluded from discounts on its page.')).toBeDefined()
  })
})
