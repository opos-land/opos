import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Edition } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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
        <MemoryRouter>
          <EditionsPage />
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

  it('lists the editions, each opening its own area, without the form for a reader', () => {
    state.settings = 'read'
    view()

    expect(screen.getByRole('link', { name: 'Edition 2026' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026',
    )
    expect(screen.queryByRole('button', { name: 'Create the edition' })).toBeNull()
    expect(document.title).toBe('Editions · Convention A · OPOS panel')
  })

  it('offers the creation form to a member with settings=write', () => {
    state.settings = 'write'
    view()

    expect(screen.getByRole('button', { name: 'Create the edition' })).toBeDefined()
  })
})
