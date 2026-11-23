import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewCustomFieldPage } from './new-custom-field-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const createField = vi.hoisted(() => vi.fn())

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
  createCustomFieldOptions: () => ({ mutationFn: createField }),
  catalogKey: () => ['catalog'],
}))

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter
          initialEntries={['/convention-a/editions/2026/ticket-holders/custom-fields/new']}
        >
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/ticket-holders/custom-fields/new"
              element={<NewCustomFieldPage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/ticket-holders"
              element={<p>the ticket holders’ data</p>}
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
  createField.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the page of a new custom field', () => {
  it('is closed to a member who only reads the tickets of the edition', async () => {
    state.tickets = 'read'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByLabelText('Question')).toBeNull()
  })

  it('names itself and links back to the ticket holders’ data', async () => {
    view()

    expect(await screen.findByRole('heading', { name: 'New custom field', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Ticket holders’ data' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/ticket-holders',
    )
  })

  it('says, where the field is defined, that it must ask for nothing sensitive', async () => {
    view()

    expect(await screen.findByText('Ask for nothing sensitive')).toBeDefined()
    expect(screen.getByText(/must not ask about health/)).toBeDefined()
  })

  it('adds a custom field, optional unless told otherwise', async () => {
    view()
    await screen.findByLabelText('Question')

    fireEvent.change(field('Question'), { target: { value: ' City you travel from ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add the custom field' }))

    await waitFor(() => expect(createField).toHaveBeenCalledTimes(1))
    expect(createField.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026' },
      body: { label: 'City you travel from', isRequired: false },
    })
    // The member is led back to the fields, where the new one stands last.
    expect(await screen.findByText('the ticket holders’ data')).toBeDefined()
  })
})
