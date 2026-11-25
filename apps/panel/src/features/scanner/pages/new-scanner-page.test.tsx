import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewScannerPage } from './new-scanner-page'

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
  followsEdition: false,
  revokedAt: null,
  orgStanding: 'writes',
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/scanners/new']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/scanners/new"
              element={<NewScannerPage />}
            />
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

// docs/specs/0007-scanner.md, D7-D8: enabling a scanner, with the pairing code shown once.
describe('the page that enables a scanner', () => {
  it('is closed to an org who only reads the tickets of the edition', async () => {
    state.tickets = 'read'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByLabelText('Name of the scanner')).toBeNull()
  })

  it('names itself and links back to the scanners', async () => {
    view()

    expect(await screen.findByRole('heading', { name: 'Enable a scanner', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'All scanners' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/scanners',
    )
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
    // The code stays on this page, in place of the form, with the way back to the scanners.
    expect(screen.queryByLabelText('Name of the scanner')).toBeNull()
    expect(screen.getByRole('link', { name: 'All scanners' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/scanners',
    )
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
})
