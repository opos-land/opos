import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketHoldersPage } from './ticket-holders-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readShop = vi.hoisted(() => vi.fn())
const updateShop = vi.hoisted(() => vi.fn())
const readFields = vi.hoisted(() => vi.fn())
const createField = vi.hoisted(() => vi.fn())
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
vi.mock('../../shop', () => ({
  editionShopOptions: () => ({ queryKey: ['shop', 'edition'], queryFn: readShop }),
  updateEditionShopOptions: () => ({ mutationFn: updateShop }),
}))
vi.mock('../api/catalog', () => ({
  customFieldsOptions: () => ({ queryKey: ['catalog', 'custom-fields'], queryFn: readFields }),
  createCustomFieldOptions: () => ({ mutationFn: createField }),
  updateCustomFieldOptions: () => ({ mutationFn: updateField }),
  removeCustomFieldOptions: () => ({ mutationFn: removeField }),
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
  conditions: {},
  ...fields,
})
const customField = (position: number, fields: object = {}) => ({
  id: `field-${position}`,
  editionId: 'edition-2026',
  label: `Field ${position}`,
  isRequired: false,
  position,
  hidden: false,
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/ticket-holders']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/ticket-holders"
              element={<TicketHoldersPage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const field = (label: string | RegExp) => screen.getByLabelText<HTMLInputElement>(label)
const TEEN = 'A teen from the age of'
const ADULT = 'An adult from the age of'
const FORM = 'Address of the guardian consent form'

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  readShop.mockResolvedValue(shop())
  readFields.mockResolvedValue([])
  updateShop.mockImplementation(({ body }: { body: object }) => Promise.resolve(shop(body)))
  for (const mock of [createField, updateField, removeField]) mock.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("the ticket holders' data page", () => {
  it('shows nothing to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readShop).not.toHaveBeenCalled()
    expect(readFields).not.toHaveBeenCalled()
  })

  it('shows the ages and the form the edition has set', async () => {
    readShop.mockResolvedValue(
      shop({
        ageBands: { teenFromAge: 13, adultFromAge: 18 },
        guardianConsentFormUrl: 'https://convention.test/consent.pdf',
      }),
    )

    view()

    await waitFor(() => expect(field(TEEN).value).toBe('13'))
    expect(field(ADULT).value).toBe('18')
    expect(field(FORM).value).toBe('https://convention.test/consent.pdf')
  })

  it('saves the two ages together with the address of the form', async () => {
    view()
    await screen.findByLabelText(TEEN)

    fireEvent.change(field(TEEN), { target: { value: '13' } })
    fireEvent.change(field(ADULT), { target: { value: '18' } })
    fireEvent.change(field(FORM), { target: { value: ' https://convention.test/consent.pdf ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the age bands' }))

    await waitFor(() => expect(updateShop).toHaveBeenCalledTimes(1))
    expect(updateShop.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026' },
      body: {
        ageBands: { teenFromAge: 13, adultFromAge: 18 },
        guardianConsentFormUrl: 'https://convention.test/consent.pdf',
      },
    })
  })

  it('clears the ages and the form when their fields are emptied', async () => {
    readShop.mockResolvedValue(
      shop({
        ageBands: { teenFromAge: 13, adultFromAge: 18 },
        guardianConsentFormUrl: 'https://c.test/f',
      }),
    )
    view()
    await waitFor(() => expect(field(TEEN).value).toBe('13'))

    for (const label of [TEEN, ADULT, FORM])
      fireEvent.change(field(label), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the age bands' }))

    await waitFor(() => expect(updateShop).toHaveBeenCalledTimes(1))
    expect(updateShop.mock.calls[0]![0]).toMatchObject({
      body: { ageBands: null, guardianConsentFormUrl: null },
    })
  })

  it.each([
    ['an adult no older than a teen', '18', '18', '', /Enter both ages/],
    ['one age alone', '13', '', '', /Enter both ages/],
    ['a form that is no link', '13', '18', 'consent.pdf', /starts with https/],
  ])('refuses %s beside its field, and saves nothing', async (_, teen, adult, form, message) => {
    view()
    await screen.findByLabelText(TEEN)

    fireEvent.change(field(TEEN), { target: { value: teen } })
    fireEvent.change(field(ADULT), { target: { value: adult } })
    fireEvent.change(field(FORM), { target: { value: form } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the age bands' }))

    expect(await screen.findByText(message)).toBeDefined()
    expect(updateShop).not.toHaveBeenCalled()
  })

  it('says, where a field is defined, that it must ask for nothing sensitive', async () => {
    view()

    expect(await screen.findByText('Ask for nothing sensitive')).toBeDefined()
    expect(screen.getByText(/must not ask about health/)).toBeDefined()
  })

  it('lists the custom fields in their order, each required or optional', async () => {
    readFields.mockResolvedValue([
      customField(1, { label: 'City', isRequired: true }),
      customField(2, { label: 'Fandom', hidden: true }),
    ])

    view()

    const city = await screen.findByRole('listitem', { name: 'City' })
    expect(within(city).getByText('Required')).toBeDefined()
    const fandom = screen.getByRole('listitem', { name: 'Fandom' })
    expect(within(fandom).getByText('Optional')).toBeDefined()
    expect(within(fandom).getByText('Hidden from the shop')).toBeDefined()
  })

  it('changes, moves and hides a field, and deletes it once the modal is confirmed', async () => {
    readFields.mockResolvedValue([customField(1), customField(2)])
    view()
    const first = await screen.findByRole('listitem', { name: 'Field 1' })

    fireEvent.click(within(first).getByRole('button', { name: 'Move down' }))
    fireEvent.click(within(first).getByRole('button', { name: 'Hide from the shop' }))
    await waitFor(() => expect(updateField).toHaveBeenCalledTimes(2))
    expect(updateField.mock.calls.map(([call]) => (call as { body: object }).body)).toEqual([
      { position: 2 },
      { hidden: true },
    ])

    fireEvent.click(within(first).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(first).getByLabelText('Answer'), { target: { value: 'required' } })
    fireEvent.click(within(first).getByRole('button', { name: 'Save the custom field' }))
    await waitFor(() => expect(updateField).toHaveBeenCalledTimes(3))
    expect(updateField.mock.calls[2]![0]).toEqual({
      params: { editionId: 'edition-2026', fieldId: 'field-1' },
      body: { label: 'Field 1', isRequired: true },
    })

    const second = screen.getByRole('listitem', { name: 'Field 2' })
    fireEvent.click(within(second).getByRole('button', { name: 'Delete the custom field' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(removeField).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the custom field' }))
    await waitFor(() => expect(removeField).toHaveBeenCalledTimes(1))
  })

  it('lets a reader see everything and change nothing', async () => {
    state.tickets = 'read'
    readFields.mockResolvedValue([customField(1)])

    view()

    await screen.findByRole('listitem', { name: 'Field 1' })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link', { name: 'New custom field' })).toBeNull()
    expect(field(TEEN).matches(':disabled')).toBe(true)
  })

  it('links a member who may add to the page of a new custom field, and holds no form of one', async () => {
    view()
    await screen.findByText('The edition has no custom fields yet.')

    expect(screen.getByRole('link', { name: 'New custom field' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/ticket-holders/custom-fields/new',
    )
    expect(screen.queryByLabelText('Question')).toBeNull()
  })
})
