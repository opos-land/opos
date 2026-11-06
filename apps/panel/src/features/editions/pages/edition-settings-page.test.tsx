import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Edition } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionSettingsPage } from './edition-settings-page'

const state = vi.hoisted(() => ({ settings: 'none', program: 'none' }))
const update = vi.hoisted(() => vi.fn())

const edition: Edition = {
  id: 'edition-1',
  slug: '2026',
  name: 'Edition 2026',
  startsAt: '2026-06-05T08:00:00.000Z',
  endsAt: '2026-06-07T16:00:00.000Z',
  isActive: false,
  isPublished: false,
}

vi.mock('../hooks/use-editions', () => ({
  useEditionBySlug: () => ({ isPending: false, isError: false, error: null, edition }),
}))
vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: {
      settings: state.settings,
      edition: () => ({ program: state.program, websiteContent: 'none', tickets: 'none' }),
    },
    api: {},
  }),
  useTenantTime: () => ({
    timeZone: 'Europe/Warsaw',
    range: () => 'the dates of the edition',
    toInput: (iso: string) => iso.slice(0, 16),
    fromInput: (value: string) => `${value}:00.000Z`,
  }),
}))
vi.mock('../api/editions', () => ({
  editionsKey: () => ['editions'],
  updateEditionOptions: () => ({ mutationFn: update }),
  activateEditionOptions: () => ({ mutationFn: vi.fn() }),
  removeEditionOptions: () => ({ mutationFn: vi.fn() }),
}))

function Location() {
  return <output aria-label="location">{useLocation().pathname}</output>
}

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/settings']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/settings"
              element={<EditionSettingsPage />}
            />
          </Routes>
          <Location />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.settings = 'none'
  state.program = 'none'
  update.mockReset()
})

afterEach(cleanup)

describe('EditionSettingsPage', () => {
  it('is closed to a member without settings, even one with the programme', () => {
    state.program = 'write'
    view()

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(document.title).toBe('No permissions · OPOS panel')
  })

  it('shows the data with saving disabled to a member who reads the settings', () => {
    state.settings = 'read'
    view()

    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeDefined()
    expect(screen.getByText('Edition 2026')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull()
    expect(document.title).toBe('Settings · Edition 2026 · OPOS panel')
  })

  it('links to no other section of the edition: the menu does', () => {
    state.settings = 'write'
    state.program = 'write'
    view()

    expect(screen.queryByRole('link')).toBeNull()
  })

  it('stays on the settings when the edition gets a new address', async () => {
    state.settings = 'write'
    update.mockResolvedValue({ ...edition, slug: 'next-year' })
    view()

    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'next-year' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('/convention-a/editions/next-year/settings', {
        selector: 'output',
      }),
    ).toBeDefined()
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      params: { editionId: 'edition-1' },
      body: { slug: 'next-year' },
    })
  })
})
