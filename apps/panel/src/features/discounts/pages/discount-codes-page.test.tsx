import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscountCodesPage } from './discount-codes-page'

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

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/discount-codes']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/discount-codes"
              element={<DiscountCodesPage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const row = (name: string) => screen.getByRole('listitem', { name })
const field = (label: string | RegExp) => screen.getByLabelText<HTMLInputElement>(label)
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(field(label), { target: { value } })
const tick = (name: string | RegExp) => fireEvent.click(screen.getByRole('checkbox', { name }))
const empty = () => screen.findByText('The edition has no discount codes yet.')

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

// docs/specs/0008-discount-codes.md, Screens: the list with each code's uses and limit, the form
// of D1-D4, ending a code.
describe('the discount codes page', () => {
  it('shows nothing of the codes to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readCodes).not.toHaveBeenCalled()
  })

  it('lists the codes, each with its value, its uses against its limit and what it applies to', async () => {
    readCodes.mockResolvedValue([
      code('early10', { uses: 3, usageLimit: 10 }),
      code('merch20', {
        kind: 'amount',
        percent: null,
        amountMinor: 2000,
        uses: 1,
        ticketTypeIds: [],
        addOnIds: ['room'],
        itemIds: ['shirt'],
      }),
    ])

    view()

    const early = await screen.findByRole('listitem', { name: 'EARLY10' })
    expect(within(early).getByText('10%')).toBeDefined()
    expect(within(early).getByText('Uses: 3 of 10')).toBeDefined()
    expect(within(early).getByText('Applies to: Standard')).toBeDefined()
    expect(within(early).getByText('Valid: 2020-01-01 to 2099-01-01')).toBeDefined()
    expect(within(early).getByText('Active')).toBeDefined()
    const merch = row('MERCH20')
    expect(within(merch).getByText('20.00 PLN')).toBeDefined()
    expect(within(merch).getByText('Uses: 1, no limit')).toBeDefined()
    expect(within(merch).getByText('Applies to: Sleeping room, T-shirt')).toBeDefined()
  })

  it('says why a code cannot be used now', async () => {
    readCodes.mockResolvedValue([
      code('ended-one', { ended: true }),
      code('expired-one', { validUntil: '2021-01-01T10:00:00.000Z' }),
      code('later-one', { validFrom: '2098-01-01T10:00:00.000Z' }),
      code('used-one', { uses: 1, usageLimit: 1 }),
    ])

    view()

    const ended = await screen.findByRole('listitem', { name: 'ENDED-ONE' })
    expect(within(ended).getByText('Ended')).toBeDefined()
    expect(within(row('EXPIRED-ONE')).getByText('Expired')).toBeDefined()
    expect(within(row('LATER-ONE')).getByText('Not valid yet')).toBeDefined()
    expect(within(row('USED-ONE')).getByText('Used up')).toBeDefined()
  })

  it('lets a member with read access see the codes and change nothing', async () => {
    state.tickets = 'read'
    readCodes.mockResolvedValue([code('early10')])

    view()

    await screen.findByRole('listitem', { name: 'EARLY10' })
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'End the code' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete the code' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add the code' })).toBeNull()
  })

  it('adds a percent code for what the org ticks, valid until the edition ends unless changed', async () => {
    view()
    await empty()
    await screen.findByRole('checkbox', { name: 'Standard' })

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
    // The form is empty again for the next code.
    await waitFor(() => expect(field('Code').value).toBe(''))
  })

  it('asks for an amount of an amount code alone', async () => {
    view()
    await empty()

    expect(screen.queryByLabelText(/^Amount off/)).toBeNull()
    type('Kind', 'amount')

    expect(field(/^Amount off/)).toBeDefined()
    expect(screen.queryByLabelText('Percent off')).toBeNull()
  })

  it('names what is wrong beside its field, and sends nothing', async () => {
    view()
    await empty()

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
    await empty()

    const excluded = await screen.findByRole('checkbox', { name: 'Supporter' })
    expect(excluded.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(excluded)
    expect(excluded.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Excluded from discounts on its page.')).toBeDefined()
  })

  it('ends a code without asking, and lets an ended one run again', async () => {
    readCodes.mockResolvedValue([code('early10'), code('guest100', { ended: true })])
    view()
    await screen.findByRole('listitem', { name: 'EARLY10' })

    fireEvent.click(within(row('EARLY10')).getByRole('button', { name: 'End the code' }))
    fireEvent.click(within(row('GUEST100')).getByRole('button', { name: 'Let it run again' }))

    await waitFor(() => expect(updateCode).toHaveBeenCalledTimes(2))
    expect(updateCode.mock.calls.map(([call]) => call as object)).toEqual([
      { params: { editionId: 'edition-2026', codeId: 'code-early10' }, body: { ended: true } },
      { params: { editionId: 'edition-2026', codeId: 'code-guest100' }, body: { ended: false } },
    ])
  })

  it('edits a code in place, the form filled with what it holds', async () => {
    readCodes.mockResolvedValue([code('early10', { usageLimit: 5, uses: 2 })])
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const form = within(row('EARLY10'))
    await form.findByRole('checkbox', { name: 'Standard' })
    expect(form.getByLabelText<HTMLInputElement>('Code').value).toBe('EARLY10')
    expect(form.getByLabelText<HTMLInputElement>('Percent off').value).toBe('10')
    expect(form.getByLabelText<HTMLInputElement>('Usage limit').value).toBe('5')
    expect(form.getByRole('checkbox', { name: 'Standard' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    fireEvent.change(form.getByLabelText('Usage limit'), { target: { value: '20' } })
    fireEvent.click(form.getByRole('button', { name: 'Save the code' }))

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
  })
})
