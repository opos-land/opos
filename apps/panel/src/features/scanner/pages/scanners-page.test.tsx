import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScannersPage } from './scanners-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readScanners = vi.hoisted(() => vi.fn())
const createScanner = vi.hoisted(() => vi.fn())
const revokeScanner = vi.hoisted(() => vi.fn())

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
  createScannerOptions: () => ({ mutationFn: createScanner }),
  revokeScannerOptions: () => ({ mutationFn: revokeScanner }),
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
  revokeScanner.mockResolvedValue({})
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
    expect(within(rows[3]!).getByText('Revoked')).toBeDefined()
    // A revoked scanner is revoked no more.
    expect(within(rows[3]!).queryByRole('button', { name: /Revoke/ })).toBeNull()
  })

  it('enables a scanner and shows its pairing code once, as a QR code and as a link', async () => {
    createScanner.mockResolvedValue({
      ...scanner('Main gate', { paired: false, lastUsedAt: null }),
      pairingCode: 'the-pairing-code',
      pairingExpiresAt: '2026-06-05T08:15:00.000Z',
    })
    view()

    fireEvent.change(await screen.findByLabelText('Name of the scanner'), {
      target: { value: 'Main gate' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enable the scanner' }))

    await waitFor(() =>
      expect(createScanner.mock.calls[0]?.[0]).toEqual({
        params: { editionId: 'edition-2026' },
        body: { name: 'Main gate' },
      }),
    )
    const link = `${window.location.origin}/scanner#the-pairing-code`
    expect(await screen.findByText(link)).toBeDefined()
    const picture = await screen.findByRole('img', { name: /QR code that pairs a phone/ })
    expect(picture.getAttribute('src')).toBe(`data:qr,${link}`)
    expect(screen.getByText(/works once, until at 2026-06-05T08:15:00.000Z/)).toBeDefined()
    expect(screen.getByText(/shown only now/)).toBeDefined()
  })

  it('sets an earlier end when the org gives one', async () => {
    createScanner.mockResolvedValue({
      ...scanner('Desk'),
      pairingCode: 'code',
      pairingExpiresAt: '2026-06-05T08:15:00.000Z',
    })
    view()

    fireEvent.change(await screen.findByLabelText('Name of the scanner'), {
      target: { value: 'Desk' },
    })
    fireEvent.change(screen.getByLabelText(/Ends earlier/), {
      target: { value: '2026-06-06T18:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enable the scanner' }))

    await waitFor(() =>
      expect(createScanner.mock.calls[0]?.[0]).toEqual({
        params: { editionId: 'edition-2026' },
        body: { name: 'Desk', expiresAt: '2026-06-06T18:00:00.000Z' },
      }),
    )
  })

  it('revokes a scanner only through a modal that says nothing brings its access back', async () => {
    readScanners.mockResolvedValue([scanner('Main gate')])
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Main gate' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText(/Main gate/)).toBeDefined()
    expect(dialog.getByText(/reads and marks nothing from then on/)).toBeDefined()
    expect(revokeScanner).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Revoke the scanner' }))

    await waitFor(() =>
      expect(revokeScanner.mock.calls[0]?.[0]).toEqual({
        params: { editionId: 'edition-2026', scannerId: 'id-Main gate' },
      }),
    )
  })

  it('lets an org with read access see the scanners and enable or revoke none', async () => {
    state.tickets = 'read'
    readScanners.mockResolvedValue([scanner('Main gate')])
    view()

    expect(await screen.findByText('Main gate')).toBeDefined()
    expect(screen.queryByRole('button', { name: /Revoke/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enable the scanner' })).toBeNull()
  })
})
