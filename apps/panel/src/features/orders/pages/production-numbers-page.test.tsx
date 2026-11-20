import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as SaveFile from '../model/save-file'
import { ProductionNumbersPage } from './production-numbers-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readNumbers = vi.hoisted(() => vi.fn())
const readFile = vi.hoisted(() => vi.fn())
const saved = vi.hoisted(() => ({ files: [] as { name: string; body: Blob }[] }))

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
  useTenantTime: () => ({ format: (iso: string) => `at ${iso}` }),
}))
vi.mock('../../editions', () => ({
  useEditionBySlug: () => ({
    isPending: false,
    isError: false,
    error: null,
    edition: { id: 'edition-2026', slug: '2026', name: 'Edition 2026' },
  }),
}))
vi.mock('../api/orders', () => ({
  productionNumbersOptions: () => ({ queryKey: ['orders', 'production'], queryFn: readNumbers }),
  productionNumbersExportOptions: () => ({
    queryKey: ['orders', 'production', 'file'],
    queryFn: readFile,
  }),
}))
vi.mock('../model/save-file', async (original) => ({
  ...(await original<typeof SaveFile>()),
  saveFile: (name: string, body: Blob) => saved.files.push({ name, body }),
}))

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/production-numbers']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/production-numbers"
              element={<ProductionNumbersPage />}
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
  state.tickets = 'read'
  saved.files = []
  readNumbers.mockResolvedValue({
    deadline: '2026-05-01T00:00:00.000Z',
    items: [
      {
        itemId: 'shirt',
        name: 'Shirt',
        variants: [
          { variantId: 'shirt-m', labels: ['M'], paid: 3, awaitingPayment: 1, needsReview: 0 },
          { variantId: 'shirt-l', labels: ['L'], paid: 5, awaitingPayment: 0, needsReview: 2 },
        ],
      },
      {
        itemId: 'pin',
        name: 'Pin',
        variants: [
          { variantId: 'pin-one', labels: [], paid: 4, awaitingPayment: 0, needsReview: 0 },
        ],
      },
    ],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the production numbers page', () => {
  it('shows nothing to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readNumbers).not.toHaveBeenCalled()
  })

  it('counts every variant: paid, and apart from it awaiting payment and needing review', async () => {
    view()

    const rows = await screen.findAllByRole('row')
    expect(
      rows.map((row) => Array.from(row.querySelectorAll('th,td'), (cell) => cell.textContent)),
    ).toEqual([
      ['Merchandise item', 'Variant', 'Paid', 'Awaiting payment', 'Needs review'],
      ['Shirt', 'M', '3', '1', '0'],
      ['Shirt', 'L', '5', '0', '2'],
      ['Pin', '—', '4', '0', '0'],
    ])
    expect(screen.getByText(/at 2026-05-01T00:00:00.000Z/)).toBeDefined()
  })

  it('says the numbers wait for the pre-order deadline', async () => {
    readNumbers.mockRejectedValue(
      new ORPCError('production.before-deadline', {
        status: 409,
        data: { deadline: '2026-09-01T00:00:00.000Z' },
      }),
    )

    view()

    expect(await screen.findByText(/pre-order deadline has passed/i)).toBeDefined()
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull()
  })

  it('downloads the numbers as a file under the name the API gives it', async () => {
    const body = new Blob(['csv'], { type: 'text/csv' })
    readFile.mockResolvedValue({
      headers: { 'content-disposition': 'attachment; filename="production-numbers-2026.csv"' },
      body,
    })
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Download as a file' }))

    await waitFor(() =>
      expect(saved.files).toEqual([{ name: 'production-numbers-2026.csv', body }]),
    )
  })
})
