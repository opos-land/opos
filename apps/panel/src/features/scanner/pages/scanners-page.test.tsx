import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScannersPage } from './scanners-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readScanners = vi.hoisted(() => vi.fn())

vi.mock('qrcode', () => ({ toDataURL: (text: string) => Promise.resolve(`data:qr,${text}`) }))
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
    format: (iso: string) => `at ${iso}`,
    fromInput: (value: string) => `${value}:00.000Z`,
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
vi.mock('../api/scanners', () => ({
  scannersKey: () => ['scanners'],
  scannersOptions: () => ({ queryKey: ['scanners', 'list'], queryFn: readScanners }),
}))

const scanner = (name: string, fields: object = {}) => ({
  id: `id-${name}`,
  name,
  enabledBy: 'head@convention-a.test',
  paired: true,
  lastUsedAt: '2026-06-05T09:00:00.000Z',
  expiresAt: '2099-06-08T16:00:00.000Z',
  revokedAt: null,
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/scanners']}>
          <Routes>
            <Route path="/:tenantSlug/editions/:editionSlug/scanners" element={<ScannersPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'write'
  readScanners.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the scanners page', () => {
  it('shows nothing to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readScanners).not.toHaveBeenCalled()
  })

  it('lists each scanner with who enabled it, when it was last used and when it ends', async () => {
    readScanners.mockResolvedValue([
      scanner('Main gate'),
      scanner('Desk', { paired: false, lastUsedAt: null, enabledBy: null }),
      scanner('Old gate', { revokedAt: '2026-06-05T12:00:00.000Z' }),
    ])

    view()

    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(4)
    const gate = within(rows[1]!)
    expect(gate.getByText('Main gate')).toBeDefined()
    expect(gate.getByText('head@convention-a.test')).toBeDefined()
    expect(gate.getByText('at 2026-06-05T09:00:00.000Z')).toBeDefined()
    expect(gate.getByText('at 2099-06-08T16:00:00.000Z')).toBeDefined()
    expect(within(rows[2]!).getByText('Waiting for a phone')).toBeDefined()
    // No address: an org who left the team, or one this member may not be told of.
    expect(within(rows[2]!).getByText('Another organizer')).toBeDefined()
    expect(within(rows[3]!).getByText('Revoked')).toBeDefined()
  })

  it('opens the page of a scanner from its row, for a reader too, and revokes none in the list', async () => {
    state.tickets = 'read'
    readScanners.mockResolvedValue([scanner('Main gate')])
    view()

    const link = await screen.findByRole('link', { name: 'Main gate' })
    expect(link.getAttribute('href')).toBe('/convention-a/editions/2026/scanners/id-Main gate')
    cleanup()

    // Revoking is on the page of the scanner, for an org who may.
    state.tickets = 'write'
    view()
    await screen.findByRole('link', { name: 'Main gate' })
    expect(screen.queryByRole('button', { name: /Revoke/ })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull()
  })

  it('lets an org with read access see the scanners and enable or revoke none', async () => {
    state.tickets = 'read'
    readScanners.mockResolvedValue([scanner('Main gate')])
    view()

    expect(await screen.findByText('Main gate')).toBeDefined()
    expect(screen.queryByRole('button', { name: /Revoke/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Enable a scanner' })).toBeNull()
  })

  it('links an org who may enable one to the page that does, and holds no form of it', async () => {
    view()
    await screen.findByText('The edition has no scanners yet.')

    expect(screen.getByRole('link', { name: 'Enable a scanner' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/scanners/new',
    )
    expect(screen.queryByLabelText('Name of the scanner')).toBeNull()
  })
})
