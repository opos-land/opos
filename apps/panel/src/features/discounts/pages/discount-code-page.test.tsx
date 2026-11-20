import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscountCodePage } from './discount-code-page'

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

const code = (text: string, fields: object = {}) => ({
  id: `code-${text}`,
  code: text,
  kind: 'percent',
  percent: 10,
  amountMinor: null,
  usageLimit: null,
  uses: 0,
  validFrom: '2020-01-01T10:00:00.000Z',
  validUntil: '2099-01-01T10:00:00.000Z',
  ended: false,
  ticketTypeIds: ['standard'],
  addOnIds: [],
  itemIds: [],
  ...fields,
})

const view = (id = 'code-early10') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/convention-a/editions/2026/discount-codes/${id}`]}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/discount-codes/:codeId"
              element={<DiscountCodePage />}
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

// docs/specs/0008-discount-codes.md, Screens: the form of D1-D4 for a code that exists, and its
// deletion, on the page of the code.
describe('the page of a discount code', () => {
  it('is closed to a member who only reads the tickets of the edition', async () => {
    state.tickets = 'read'
    readCodes.mockResolvedValue([code('early10')])

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByLabelText('Code')).toBeNull()
  })

  it('names itself after the code and links back to the discount codes', async () => {
    readCodes.mockResolvedValue([code('early10')])
    view()

    expect(await screen.findByRole('heading', { name: 'EARLY10', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'All discount codes' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/discount-codes',
    )
  })

  it('says so when the edition holds no such code', async () => {
    readCodes.mockResolvedValue([code('early10')])
    view('code-gone')

    expect(await screen.findByRole('heading', { name: /not found/i })).toBeDefined()
  })

  it('changes the code, the form filled with what it holds', async () => {
    readCodes.mockResolvedValue([code('early10', { usageLimit: 5, uses: 2 })])
    view()

    const standard = await screen.findByRole('checkbox', { name: 'Standard' })
    expect(field('Code').value).toBe('EARLY10')
    expect(field('Percent off').value).toBe('10')
    expect(field('Usage limit').value).toBe('5')
    expect(standard.getAttribute('aria-checked')).toBe('true')
    fireEvent.change(field('Usage limit'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the code' }))

    await waitFor(() => expect(updateCode).toHaveBeenCalledTimes(1))
    expect(updateCode.mock.calls[0]![0]).toMatchObject({
      params: { editionId: 'edition-2026', codeId: 'code-early10' },
      body: { code: 'EARLY10', kind: 'percent', percent: 10, usageLimit: 20 },
    })
  })

  it('deletes a code only once the modal that names it is confirmed', async () => {
    readCodes.mockResolvedValue([code('early10')])
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete the code' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete the code “EARLY10”?')).toBeDefined()
    expect(removeCode).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the code' }))

    await waitFor(() => expect(removeCode).toHaveBeenCalledTimes(1))
    expect(removeCode.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', codeId: 'code-early10' },
    })
    // Nothing is left to show of it: the member is led back to the codes.
    expect(await screen.findByText('the list of discount codes')).toBeDefined()
  })
})
