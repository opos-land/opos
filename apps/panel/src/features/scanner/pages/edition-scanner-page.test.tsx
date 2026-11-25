import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionScannerPage } from './edition-scanner-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readScanner = vi.hoisted(() => vi.fn())
const renewPairing = vi.hoisted(() => vi.fn())
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
  scannerOptions: (_: unknown, __: string, scannerId: string) => ({
    queryKey: ['scanners', 'one', scannerId],
    queryFn: () => readScanner(scannerId) as unknown,
  }),
  renewPairingOptions: () => ({ mutationFn: renewPairing }),
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
  orgStanding: 'writes',
  ...fields,
})

const NOTHING = { orders: 0, lines: 0, firstAt: null, lastAt: null, latest: [] }
/** The scanner of the page, paired with a phone and with nothing handed out unless said. */
const gate = (fields: object = {}) => ({
  ...scanner('Main gate'),
  id: 'id-gate',
  handOuts: NOTHING,
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/scanners/id-gate']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/scanners/:scannerId"
              element={<EditionScannerPage />}
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
  readScanner.mockResolvedValue(gate())
  revokeScanner.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// docs/specs/0007-scanner.md, D14-D15: the page of a scanner.
describe('the page of a scanner', () => {
  it('shows nothing to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readScanner).not.toHaveBeenCalled()
  })

  it('names itself after the scanner, tells what the list tells of it and links back', async () => {
    state.tickets = 'read'
    view()

    expect(await screen.findByRole('heading', { name: 'Main gate', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'All scanners' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/scanners',
    )
    const about = within(screen.getByRole('region', { name: 'Scanner' }))
    expect(about.getByText('Paired with a phone')).toBeDefined()
    expect(about.getByText('head@convention-a.test')).toBeDefined()
    expect(about.getByText('at 2026-06-05T09:00:00.000Z')).toBeDefined()
    expect(about.getByText('at 2099-06-08T16:00:00.000Z')).toBeDefined()
  })

  it('tells what the scanner handed out, and lists the orders it marked last with a link to each', async () => {
    state.tickets = 'read'
    readScanner.mockResolvedValue(
      gate({
        handOuts: {
          orders: 2,
          lines: 3,
          firstAt: '2027-06-01T08:00:00.000Z',
          lastAt: '2027-06-02T10:00:00.000Z',
          latest: [
            {
              orderId: 'order-grace',
              number: 'GRACE22222',
              holderName: 'Grace',
              lines: 1,
              lastAt: '2027-06-02T10:00:00.000Z',
            },
            {
              orderId: 'order-ada',
              number: 'ADA2222222',
              holderName: 'Ada',
              lines: 2,
              lastAt: '2027-06-01T08:05:00.000Z',
            },
          ],
        },
      }),
    )
    view()

    const handOuts = within(await screen.findByRole('region', { name: 'Hand-outs' }))
    const counts = within(handOuts.getByRole('table', { name: 'What the scanner handed out' }))
    expect(
      counts
        .getAllByRole('row')
        .map((line) => [
          line.querySelector('th')?.textContent,
          line.querySelector('td')?.textContent,
        ]),
    ).toEqual([
      ['Orders', '2'],
      ['Entries and items', '3'],
      ['First hand-out', 'at 2027-06-01T08:00:00.000Z'],
      ['Last hand-out', 'at 2027-06-02T10:00:00.000Z'],
    ])
    const orders = within(
      handOuts.getByRole('table', { name: 'Orders the scanner handed out last' }),
    )
    expect(orders.getByRole('link', { name: 'GRACE22222' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/orders/order-grace',
    )
    const ada = orders.getByRole('link', { name: 'ADA2222222' }).closest('tr')!
    expect([...ada.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual([
      'ADA2222222',
      'Ada',
      '2',
      'at 2027-06-01T08:05:00.000Z',
    ])
  })

  it('says so when the scanner handed nothing out', async () => {
    state.tickets = 'read'
    view()

    const handOuts = within(await screen.findByRole('region', { name: 'Hand-outs' }))
    expect(handOuts.getByText('The scanner handed nothing out yet.')).toBeDefined()
    expect(handOuts.queryByRole('table')).toBeNull()
  })

  it('lets a reader pair no phone and revoke nothing', async () => {
    state.tickets = 'read'
    view()

    await screen.findByRole('heading', { name: 'Main gate', level: 1 })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Pair a phone' })).toBeNull()
  })

  it('gives a scanner that waits for a phone a new pairing code at one press, and shows it once', async () => {
    readScanner.mockResolvedValue(gate({ paired: false, lastUsedAt: null }))
    renewPairing.mockResolvedValue({
      ...gate({ paired: false }),
      pairingCode: 'the-new-code',
      pairingExpiresAt: '2026-06-05T08:15:00.000Z',
    })
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'New pairing code' }))

    await waitFor(() =>
      expect(renewPairing.mock.calls[0]?.[0]).toEqual({
        params: { editionId: 'edition-2026', scannerId: 'id-gate' },
      }),
    )
    const link = `${window.location.origin}/scanner#the-new-code`
    expect(await screen.findByText(link)).toBeDefined()
    const picture = await screen.findByRole('img', { name: /QR code that pairs a phone/ })
    expect(picture.getAttribute('src')).toBe(`data:qr,${link}`)
    expect(screen.getByText(/shown only now/)).toBeDefined()
  })

  it('asks in a modal before it takes the scanner from the phone that holds it', async () => {
    renewPairing.mockResolvedValue({
      ...gate({ paired: false }),
      pairingCode: 'the-new-code',
      pairingExpiresAt: '2026-06-05T08:15:00.000Z',
    })
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'New pairing code' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(
      dialog.getByText(/The phone that holds the scanner now reads and marks nothing/),
    ).toBeDefined()
    expect(renewPairing).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Pair another phone' }))

    await waitFor(() => expect(renewPairing).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/scanner#the-new-code$/)).toBeDefined()
  })

  it('revokes the scanner only through a modal that says nothing brings its access back', async () => {
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke the scanner' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText(/Main gate/)).toBeDefined()
    expect(dialog.getByText(/reads and marks nothing from then on/)).toBeDefined()
    expect(revokeScanner).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Revoke the scanner' }))

    await waitFor(() =>
      expect(revokeScanner.mock.calls[0]?.[0]).toEqual({
        params: { editionId: 'edition-2026', scannerId: 'id-gate' },
      }),
    )
  })

  // The organizer who enabled it cannot manage the tickets right now: the scanner opens nothing
  // until they can, and no new pairing code would change that.
  it('says why a scanner its organizer stops reads nothing, to a reader too, and gives it no new code', async () => {
    state.tickets = 'read'
    readScanner.mockResolvedValue(gate({ orgStanding: 'stopped' }))
    view()

    const about = within(await screen.findByRole('region', { name: 'Scanner' }))
    expect(about.getByText('Stopped: its organizer cannot manage tickets now')).toBeDefined()
    expect(about.getByText(/works again, on the phone that holds it/)).toBeDefined()
    cleanup()

    state.tickets = 'write'
    view()
    await screen.findByRole('region', { name: 'Scanner' })
    expect(screen.queryByRole('button', { name: 'New pairing code' })).toBeNull()
    expect(screen.getByText(/A stopped scanner gets no new pairing code/)).toBeDefined()
    // It is revoked like any other.
    expect(screen.getByRole('button', { name: 'Revoke the scanner' })).toBeDefined()
  })

  it('says that a scanner whose organizer left the team is stopped for good', async () => {
    readScanner.mockResolvedValue(gate({ orgStanding: 'left', enabledBy: null }))
    view()

    const about = within(await screen.findByRole('region', { name: 'Scanner' }))
    expect(about.getByText('Stopped: its organizer left the team')).toBeDefined()
    expect(about.getByText(/Revoke it and enable a new scanner/)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'New pairing code' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Revoke the scanner' })).toBeDefined()
  })

  it('pairs no phone with a scanner that was revoked or has ended, and revokes it no more', async () => {
    readScanner.mockResolvedValue(gate({ revokedAt: '2026-06-05T12:00:00.000Z' }))
    view()

    const about = within(await screen.findByRole('region', { name: 'Scanner' }))
    expect(about.getByText('Revoked')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/gets no new pairing code/)).toBeDefined()
    cleanup()

    readScanner.mockResolvedValue(gate({ expiresAt: '2020-01-01T00:00:00.000Z' }))
    view()
    expect(
      within(await screen.findByRole('region', { name: 'Scanner' })).getByText('Ended'),
    ).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
