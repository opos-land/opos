import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionPage } from './edition-page'

const api = vi.hoisted(() => ({ convention: vi.fn(), edition: vi.fn() }))

vi.mock('../api/conventions', () => ({
  conventionOptions: () => ({ queryKey: ['convention'], queryFn: api.convention }),
  editionOptions: () => ({ queryKey: ['edition'], queryFn: api.edition }),
}))

const notFound = () => new ORPCError('request.not-found', { status: 404 })

const logo = { fileId: '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60', width: 400, height: 200 }

const edition = (values: object = {}) => ({
  id: 'e-2027',
  slug: '2027',
  name: 'Convention A 2027',
  startsAt: '2027-06-01T08:00:00.000Z',
  endsAt: '2027-06-03T18:00:00.000Z',
  isActive: true,
  venueName: 'Congress Hall',
  venueAddress: '1 Main St',
  venueCity: 'Poznań',
  ...values,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/conventions/convention-a/2027']}>
          <Routes>
            <Route path="/conventions/:tenantSlug/:editionSlug" element={<EditionPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  api.convention.mockReset().mockResolvedValue({
    name: 'Convention A',
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
    logo,
  })
  api.edition.mockReset().mockResolvedValue(edition())
})

afterEach(cleanup)

describe('EditionPage', () => {
  it('names the edition, and the convention with a link to its page', async () => {
    view()

    expect(
      await screen.findByRole('heading', { name: 'Convention A 2027', level: 1 }),
    ).toBeDefined()
    expect(document.title).toBe('Convention A 2027 · OPOS')
    expect(screen.getByRole('link', { name: 'Convention A' }).getAttribute('href')).toBe(
      '/conventions/convention-a',
    )
  })

  it("shows the convention's logo large, with its place kept before it loads", async () => {
    view()

    await screen.findByRole('heading', { name: 'Convention A 2027', level: 1 })
    const image = document.querySelector('img')!
    expect(image.getAttribute('src')).toMatch(
      /\/public\/tenants\/convention-a\/logo-files\/0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60\/large$/,
    )
    expect(image.getAttribute('width')).toBe('160')
    expect(image.getAttribute('height')).toBe('80')
    // The convention's name stands beside it: the picture adds nothing to read.
    expect(image.getAttribute('alt')).toBe('')
  })

  it("says when the edition takes place, in the convention's time zone, and where", async () => {
    view()

    expect(await screen.findByText('Jun 1 – 3, 2027')).toBeDefined()
    expect(screen.getByText('Congress Hall')).toBeDefined()
    expect(screen.getByText('1 Main St')).toBeDefined()
    expect(screen.getByText('Poznań')).toBeDefined()
  })

  it('shows the parts of the venue it has, and nothing of a place when it has none', async () => {
    api.edition.mockResolvedValue(edition({ venueName: null, venueAddress: null }))
    const { unmount } = view()
    expect(await screen.findByText('Poznań')).toBeDefined()
    expect(screen.getByText('Where')).toBeDefined()
    unmount()

    api.edition.mockResolvedValue(edition({ venueName: null, venueAddress: null, venueCity: null }))
    view()
    await screen.findByRole('heading', { name: 'Convention A 2027', level: 1 })
    expect(screen.queryByText('Where')).toBeNull()
  })

  it("links the edition's programme, on a page of its own", async () => {
    view()

    const link = await screen.findByRole('link', { name: 'See the programme' })
    expect(link.getAttribute('href')).toBe('/conventions/convention-a/2027/program')
  })

  it('shows no picture for a convention with no logo', async () => {
    api.convention.mockResolvedValue({
      name: 'Convention A',
      defaultLocale: 'pl',
      timezone: 'Europe/Warsaw',
      logo: null,
    })
    view()

    await screen.findByRole('heading', { name: 'Convention A 2027', level: 1 })
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the not-found screen for an unknown or unpublished edition', async () => {
    api.edition.mockRejectedValue(notFound())
    view()

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeDefined()
  })

  it('shows any other failure as an error', async () => {
    api.edition.mockRejectedValue(new ORPCError('server.error', { status: 500 }))
    view()

    expect(await screen.findByRole('alert')).toBeDefined()
  })
})
