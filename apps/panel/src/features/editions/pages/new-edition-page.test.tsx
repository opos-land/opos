import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Edition } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewEditionPage } from './new-edition-page'

const state = vi.hoisted(() => ({ settings: 'none' }))
const create = vi.hoisted(() => vi.fn())

vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: { settings: state.settings },
    api: {},
  }),
  useTenantTime: () => ({
    timeZone: 'Europe/Warsaw',
    toInput: (iso: string) => iso.slice(0, 16),
    fromInput: (value: string) => `${value}:00.000Z`,
  }),
}))
vi.mock('../api/editions', () => ({
  editionsKey: () => ['editions'],
  createEditionOptions: () => ({ mutationFn: create }),
}))

const created: Edition = {
  id: 'edition-2',
  slug: 'next-year',
  name: 'Next year',
  startsAt: '2027-06-04T10:00:00.000Z',
  endsAt: '2027-06-06T18:00:00.000Z',
  isActive: false,
  isPublished: false,
}

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/settings/editions/new']}>
          <Routes>
            <Route path="/convention-a/settings/editions/new" element={<NewEditionPage />} />
            <Route path="/convention-a/editions/:editionSlug" element={<p>The edition area</p>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.settings = 'none'
  create.mockReset()
  create.mockResolvedValue(created)
})

afterEach(cleanup)

describe('NewEditionPage', () => {
  it('is closed to a member who only reads the settings', () => {
    state.settings = 'read'
    view()

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Create the edition' })).toBeNull()
  })

  it('holds the creation form and the way back to the editions', () => {
    state.settings = 'write'
    view()

    expect(screen.getByRole('heading', { name: 'New edition', level: 1 })).toBeDefined()
    expect(screen.getByRole('region', { name: 'Edition data' })).toBeDefined()
    const back = screen.getByRole('link', { name: 'Back to the editions' })
    expect(back.getAttribute('href')).toBe('/convention-a/settings/editions')
    expect(document.title).toBe('New edition · Convention A · OPOS panel')
  })

  it("creates the edition and opens the edition's area", async () => {
    const user = userEvent.setup()
    state.settings = 'write'
    view()

    await user.type(screen.getByLabelText('Name'), 'Next year')
    await user.type(screen.getByLabelText('Address'), 'next-year')
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2027-06-04T10:00' } })
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2027-06-06T18:00' } })
    await user.click(screen.getByRole('button', { name: 'Create the edition' }))

    expect(await screen.findByText('The edition area')).toBeDefined()
    expect(create.mock.calls[0]?.[0]).toEqual({
      body: {
        name: 'Next year',
        slug: 'next-year',
        startsAt: '2027-06-04T10:00:00.000Z',
        endsAt: '2027-06-06T18:00:00.000Z',
      },
    })
  })
})
