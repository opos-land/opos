import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewAddOnPage } from './new-add-on-page'

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

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/add-ons/new']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/add-ons/new"
              element={<NewAddOnPage />}
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

describe('the page of a new add-on', () => {
  it('is closed to a member who only reads the tickets of the edition', async () => {
    state.tickets = 'read'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('names itself and links back to the add-ons', async () => {
    view()

    expect(await screen.findByRole('heading', { name: 'New add-on', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'All add-ons' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/add-ons',
    )
  })

  it('adds an add-on with the price read as an amount of minor units', async () => {
    view()
    await screen.findByLabelText('Name')

    fireEvent.change(field('Name'), { target: { value: ' Workshop ' } })
    fireEvent.change(field(/^Price/), { target: { value: '40,5' } })
    fireEvent.change(field('Limit'), { target: { value: 'limited' } })
    fireEvent.change(field('Number of places'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add the add-on' }))

    await waitFor(() => expect(createAddOn).toHaveBeenCalledTimes(1))
    expect(createAddOn.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026' },
      body: {
        name: 'Workshop',
        description: '',
        amountMinor: 4050,
        kind: 'limited',
        capacity: 30,
        placesLeftThreshold: null,
      },
    })
    // The member is led back to the list, where the new add-on stands.
    expect(await screen.findByText('the list of add-ons')).toBeDefined()
  })

  it('names what is wrong beside its field, and sends nothing', async () => {
    view()
    await screen.findByLabelText('Name')

    fireEvent.change(field(/^Price/), { target: { value: 'free' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add the add-on' }))

    expect(await screen.findByText('Enter a name.')).toBeDefined()
    expect(screen.getByText('Enter an amount, such as 40 or 40.50.')).toBeDefined()
    expect(field('Name').getAttribute('aria-invalid')).toBe('true')
    expect(createAddOn).not.toHaveBeenCalled()
  })

  it('asks for the places of a limited add-on alone', async () => {
    view()
    await screen.findByLabelText('Name')

    expect(screen.queryByLabelText('Number of places')).toBeNull()
    fireEvent.change(field('Limit'), { target: { value: 'limited' } })

    expect(field('Number of places')).toBeDefined()
    expect(field('Show the places left when fewer than')).toBeDefined()
  })
})
