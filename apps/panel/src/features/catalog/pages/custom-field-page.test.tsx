import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomFieldPage } from './custom-field-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readFields = vi.hoisted(() => vi.fn())
const updateField = vi.hoisted(() => vi.fn())
const removeField = vi.hoisted(() => vi.fn())

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
  customFieldsOptions: () => ({ queryKey: ['catalog', 'custom-fields'], queryFn: readFields }),
  updateCustomFieldOptions: () => ({ mutationFn: updateField }),
  removeCustomFieldOptions: () => ({ mutationFn: removeField }),
  catalogKey: () => ['catalog'],
}))

const customField = (position: number, fields: object = {}) => ({
  id: `field-${position}`,
  editionId: 'edition-2026',
  label: `Field ${position}`,
  isRequired: false,
  position,
  hidden: false,
  ...fields,
})

const view = (id = 'field-1') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter
          initialEntries={[`/convention-a/editions/2026/ticket-holders/custom-fields/${id}`]}
        >
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/ticket-holders/custom-fields/:fieldId"
              element={<CustomFieldPage />}
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
  readFields.mockResolvedValue([customField(1, { label: 'City' }), customField(2)])
  for (const mock of [updateField, removeField]) mock.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the page of a custom field', () => {
  it('is closed to a member who only reads the tickets of the edition', async () => {
    state.tickets = 'read'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByLabelText('Question')).toBeNull()
  })

  it('names itself after the field and links back to the ticket holders’ data', async () => {
    view()

    expect(await screen.findByRole('heading', { name: 'City', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Ticket holders’ data' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/ticket-holders',
    )
  })

  it('says so when the edition holds no such field', async () => {
    view('field-9')

    expect(await screen.findByRole('heading', { name: /not found/i })).toBeDefined()
  })

  it('says, where the field is changed, that it must ask for nothing sensitive', async () => {
    view()

    expect(await screen.findByText('Ask for nothing sensitive')).toBeDefined()
  })

  it('changes the field, the form filled with what it holds', async () => {
    view()

    expect((await screen.findByLabelText<HTMLInputElement>('Question')).value).toBe('City')
    fireEvent.change(field('Answer'), { target: { value: 'required' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the custom field' }))

    await waitFor(() => expect(updateField).toHaveBeenCalledTimes(1))
    expect(updateField.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', fieldId: 'field-1' },
      body: { label: 'City', isRequired: true },
    })
  })

  it('deletes the field only once the modal that names it is confirmed', async () => {
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete the custom field' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete the custom field “City”?')).toBeDefined()
    expect(removeField).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the custom field' }))

    await waitFor(() => expect(removeField).toHaveBeenCalledTimes(1))
    expect(removeField.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', fieldId: 'field-1' },
    })
    // Nothing is left to show of it: the member is led back to the fields.
    expect(await screen.findByText('the ticket holders’ data')).toBeDefined()
  })
})
