import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionShopPage } from './edition-shop-page'

const state = vi.hoisted(() => ({ tickets: 'none', shop: 'none' }))
const read = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
const open = vi.hoisted(() => vi.fn())
const close = vi.hoisted(() => vi.fn())

vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: {
      shop: state.shop,
      edition: () => ({ program: 'none', websiteContent: 'none', tickets: state.tickets }),
    },
    api: {},
  }),
  useTenantTime: () => ({ format: (iso: string) => `at ${iso}` }),
}))
vi.mock('../../editions', () => ({
  useEditionBySlug: (slug: string | undefined) => ({
    isPending: false,
    isError: false,
    error: null,
    edition:
      slug === '2026' ? { id: 'edition-2026', slug: '2026', name: 'Edition 2026' } : undefined,
  }),
}))
vi.mock('../api/shop', () => ({
  editionShopOptions: (_: unknown, editionId: string) => ({
    queryKey: ['shop', 'edition', editionId],
    queryFn: read,
  }),
  updateEditionShopOptions: () => ({ mutationFn: update }),
  openShopOptions: () => ({ mutationFn: open }),
  closeShopOptions: () => ({ mutationFn: close }),
  shopKey: () => ['shop'],
}))

const met = {
  'provider-account': true,
  'seller-details': true,
  'shop-terms': true,
  'privacy-policy': true,
}
const closed = { open: false, openedAt: null, faqUrl: null, conditions: met }
const opened = { ...closed, open: true, openedAt: '2027-06-01T08:00:00.000Z' }

const view = (path = '/convention-a/editions/2026/shop') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/:tenantSlug/editions/:editionSlug/shop" element={<EditionShopPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

/** The conditions as the page lists them: what each asks for, and whether it holds. */
const conditions = () =>
  within(screen.getByRole('list', { name: 'What opening the shop needs' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.tickets = 'none'
  state.shop = 'none'
  read.mockReset().mockResolvedValue(closed)
  update
    .mockReset()
    .mockImplementation(({ body }: { body: { faqUrl: string | null } }) =>
      Promise.resolve({ ...closed, faqUrl: body.faqUrl }),
    )
  open.mockReset().mockResolvedValue(opened)
  close.mockReset().mockResolvedValue(closed)
})

afterEach(cleanup)

describe('EditionShopPage', () => {
  it('is closed to a member without the tickets of the edition, and asks the API nothing', () => {
    state.shop = 'write'
    view()

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(read).not.toHaveBeenCalled()
  })

  it('names itself, and shows each condition of opening as met or missing', async () => {
    state.tickets = 'write'
    read.mockResolvedValue({
      ...closed,
      conditions: { ...met, 'provider-account': false, 'privacy-policy': false },
    })
    view()

    expect(await screen.findByText('The shop is closed: nothing can be ordered.')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Shop', level: 1 })).toBeDefined()
    expect(document.title).toBe('Shop · Edition 2026 · OPOS panel')
    expect(conditions()).toEqual([
      'The convention’s payment provider account is connected and ready to sell.Missing',
      'The seller’s details of the convention are complete.Met',
      'The shop terms have a published version.Met',
      'The privacy policy has a published version.Missing',
    ])
  })

  it('leads to where each condition is set, the convention settings only for who reads the shop', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('The shop is closed: nothing can be ordered.')

    expect(screen.getByRole('link', { name: 'Documents and consents' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/documents',
    )
    expect(screen.queryByRole('link', { name: 'Shop settings of the convention' })).toBeNull()
    cleanup()

    state.shop = 'read'
    view()
    await screen.findByText('The shop is closed: nothing can be ordered.')
    expect(
      screen.getByRole('link', { name: 'Shop settings of the convention' }).getAttribute('href'),
    ).toBe('/convention-a/settings/shop')
  })

  it('opens the shop, and says since when it is open', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('The shop is closed: nothing can be ordered.')

    fireEvent.click(screen.getByRole('button', { name: 'Open the shop' }))

    expect(
      await screen.findByText(/The shop is open since at 2027-06-01T08:00:00.000Z/),
    ).toBeDefined()
    expect(open.mock.calls[0]?.[0]).toEqual({ params: { editionId: 'edition-2026' } })
    expect(screen.queryByRole('button', { name: 'Open the shop' })).toBeNull()
  })

  it('says which conditions a refused opening names, and reads them again', async () => {
    state.tickets = 'write'
    open.mockRejectedValue(
      new ORPCError('shop.not-ready', {
        status: 409,
        data: { 'seller-details': 'missing', 'shop-terms': 'missing' },
      }),
    )
    view()
    await screen.findByText('The shop is closed: nothing can be ordered.')
    read.mockResolvedValue({
      ...closed,
      conditions: { ...met, 'seller-details': false, 'shop-terms': false },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open the shop' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The shop was not opened')
    expect(
      within(alert)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'The seller’s details of the convention are complete.',
      'The shop terms have a published version.',
    ])
    await vi.waitFor(() => expect(conditions()[1]).toMatch(/Missing$/))
  })

  it('closes an open shop, with nothing to confirm: it opens again here', async () => {
    state.tickets = 'write'
    read.mockResolvedValue(opened)
    view()
    await screen.findByText(/The shop is open since/)

    fireEvent.click(screen.getByRole('button', { name: 'Close the shop' }))

    expect(await screen.findByText('The shop is closed: nothing can be ordered.')).toBeDefined()
    expect(close.mock.calls[0]?.[0]).toEqual({ params: { editionId: 'edition-2026' } })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('saves the address of the FAQ, and clears it with an empty field', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('The shop is closed: nothing can be ordered.')
    const field = screen.getByLabelText('Address of the FAQ')

    fireEvent.change(field, { target: { value: ' https://convention-a.test/faq ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the address' }))
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026' },
      body: { faqUrl: 'https://convention-a.test/faq' },
    })

    fireEvent.change(field, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the address' }))
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls[1]?.[0]).toMatchObject({ body: { faqUrl: null } })
  })

  it('tells an address that is no link beside its field, and sends nothing', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('The shop is closed: nothing can be ordered.')

    fireEvent.change(screen.getByLabelText('Address of the FAQ'), { target: { value: 'faq' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the address' }))

    expect(
      await screen.findByText('Enter an address that starts with https:// or http://.'),
    ).toBeDefined()
    expect(update).not.toHaveBeenCalled()
  })

  it('shows the shop to a member who reads the tickets, with nothing to change it', async () => {
    state.tickets = 'read'
    read.mockResolvedValue({ ...opened, faqUrl: 'https://convention-a.test/faq' })
    view()

    await screen.findByText(/The shop is open since/)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByLabelText('Address of the FAQ').matches(':disabled')).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>('Address of the FAQ').value).toBe(
      'https://convention-a.test/faq',
    )
  })
})
