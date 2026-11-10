import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Edition } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionsPage } from './editions-page'

const state = vi.hoisted(() => ({ settings: 'none' }))

const edition: Edition = {
  id: 'edition-1',
  slug: '2026',
  name: 'Edition 2026',
  startsAt: '2026-06-05T08:00:00.000Z',
  endsAt: '2026-06-07T16:00:00.000Z',
  isActive: true,
  isPublished: false,
}

vi.mock('../hooks/use-editions', () => ({
  useEditions: () => ({ data: [edition], isPending: false, isError: false, error: null }),
}))
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
    range: () => 'the dates of the edition',
    toInput: (iso: string) => iso.slice(0, 16),
    fromInput: (value: string) => `${value}:00.000Z`,
  }),
}))
vi.mock('../api/editions', () => ({
  editionsKey: () => ['editions'],
  createEditionOptions: () => ({ mutationFn: vi.fn() }),
}))

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/settings/editions']}>
          <Routes>
            <Route path="/convention-a/settings/editions" element={<EditionsPage />} />
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
})

afterEach(cleanup)

describe('EditionsPage', () => {
  it('belongs to the convention settings: closed to a member without them', () => {
    view()

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
  })

  it('lists the editions, each opening its own area, with no new edition for a reader', () => {
    state.settings = 'read'
    view()

    expect(screen.getByRole('link', { name: 'Edition 2026' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026',
    )
    expect(screen.queryByRole('link', { name: 'New edition' })).toBeNull()
    expect(document.title).toBe('Editions · Convention A · OPOS panel')
  })

  it("opens an edition's area from anywhere in its row", async () => {
    state.settings = 'read'
    view()

    await userEvent.click(screen.getByText('the dates of the edition'))

    expect(await screen.findByText('The edition area')).toBeDefined()
  })

  it('leads a member with settings=write to the creation page, not a form on the list', () => {
    state.settings = 'write'
    view()

    const create = screen.getByRole('link', { name: 'New edition' })
    expect(create.getAttribute('href')).toBe('/convention-a/settings/editions/new')
    expect(screen.queryByRole('button', { name: 'Create the edition' })).toBeNull()
  })
})
