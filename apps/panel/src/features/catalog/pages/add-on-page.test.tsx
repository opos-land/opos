import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddOnPage } from './add-on-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readAddOns = vi.hoisted(() => vi.fn())
const createAddOn = vi.hoisted(() => vi.fn())
const updateAddOn = vi.hoisted(() => vi.fn())
const removeAddOn = vi.hoisted(() => vi.fn())

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
}))
vi.mock('../../editions', () => ({
  useEditionBySlug: () => ({
    isPending: false,
    isError: false,
    error: null,
    edition: { id: 'edition-2026', slug: '2026', name: 'Edition 2026' },
  }),
}))
vi.mock('../api/catalog', () => ({
  addOnsOptions: () => ({ queryKey: ['catalog', 'add-ons'], queryFn: readAddOns }),
  createAddOnOptions: () => ({ mutationFn: createAddOn }),
  updateAddOnOptions: () => ({ mutationFn: updateAddOn }),
  removeAddOnOptions: () => ({ mutationFn: removeAddOn }),
  catalogKey: () => ['catalog'],
}))

const addOn = (position: number, fields: object = {}) => ({
  id: `add-on-${position}`,
  editionId: 'edition-2026',
  name: `Add-on ${position}`,
  description: '',
  amountMinor: 0,
  kind: 'unlimited',
  capacity: null,
  placesLeftThreshold: null,
  position,
  hidden: false,
  ...fields,
})

const view = (id = 'add-on-1') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/convention-a/editions/2026/add-ons/${id}`]}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/add-ons/:addOnId"
              element={<AddOnPage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/add-ons"
              element={<p>the list of add-ons</p>}
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
  readAddOns.mockResolvedValue([])
  for (const mock of [createAddOn, updateAddOn, removeAddOn]) mock.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the page of an add-on', () => {
  it('is closed to a member who only reads the tickets of the edition', async () => {
    state.tickets = 'read'
    readAddOns.mockResolvedValue([addOn(1)])

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('names itself after the add-on and links back to the add-ons', async () => {
    readAddOns.mockResolvedValue([addOn(1, { name: 'Workshop' })])
    view()

    expect(await screen.findByRole('heading', { name: 'Workshop', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'All add-ons' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/add-ons',
    )
  })

  it('says so when the edition holds no such add-on', async () => {
    readAddOns.mockResolvedValue([addOn(1)])
    view('add-on-9')

    expect(await screen.findByRole('heading', { name: /not found/i })).toBeDefined()
  })

  it('changes the add-on, the form filled with what it holds', async () => {
    readAddOns.mockResolvedValue([
      addOn(1, { name: 'Workshop', amountMinor: 4000, kind: 'limited', capacity: 30 }),
    ])
    view()

    expect((await screen.findByLabelText<HTMLInputElement>('Name')).value).toBe('Workshop')
    expect(field(/^Price/).value).toBe('40.00')
    expect(field('Number of places').value).toBe('30')
    fireEvent.change(field('Limit'), { target: { value: 'unlimited' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the add-on' }))

    await waitFor(() => expect(updateAddOn).toHaveBeenCalledTimes(1))
    expect(updateAddOn.mock.calls[0]![0]).toMatchObject({
      params: { addOnId: 'add-on-1' },
      body: { name: 'Workshop', amountMinor: 4000, kind: 'unlimited', capacity: null },
    })
  })

  it('deletes an add-on only once the modal that names it is confirmed', async () => {
    readAddOns.mockResolvedValue([addOn(1, { name: 'Workshop' })])
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete the add-on' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete the add-on “Workshop”?')).toBeDefined()
    expect(removeAddOn).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the add-on' }))

    await waitFor(() => expect(removeAddOn).toHaveBeenCalledTimes(1))
    expect(removeAddOn.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', addOnId: 'add-on-1' },
    })
    // Nothing is left to show of it: the member is led back to the add-ons.
    expect(await screen.findByText('the list of add-ons')).toBeDefined()
  })
})
