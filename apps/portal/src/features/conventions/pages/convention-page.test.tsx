import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConventionPage } from './convention-page'

const api = vi.hoisted(() => ({
  convention: vi.fn(),
  active: vi.fn(),
  editions: vi.fn(),
}))

vi.mock('../api/conventions', () => ({
  conventionOptions: () => ({ queryKey: ['convention'], queryFn: api.convention }),
  activeEditionOptions: () => ({ queryKey: ['active'], queryFn: api.active }),
  editionsOptions: () => ({ queryKey: ['editions'], queryFn: api.editions }),
}))

const notFound = () => new ORPCError('request.not-found', { status: 404 })

const logo = { fileId: '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60', width: 400, height: 200 }

const edition = (year: number, isActive = false) => ({
  id: String(year),
  slug: String(year),
  name: `Edition ${year}`,
  startsAt: `${year}-06-01T08:00:00.000Z`,
  endsAt: `${year}-06-03T18:00:00.000Z`,
  isActive,
  venueName: 'Congress Hall',
  venueAddress: null,
  venueCity: 'Poznań',
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/conventions/convention-a']}>
          <Routes>
            <Route path="/conventions/:tenantSlug" element={<ConventionPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2027-01-01T00:00:00.000Z'), toFake: ['Date'] })
  api.convention.mockReset().mockResolvedValue({
    name: 'Convention A',
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
    logo,
  })
  api.active.mockReset().mockResolvedValue(edition(2027, true))
  api.editions
    .mockReset()
    .mockResolvedValue([edition(2028), edition(2027, true), edition(2026), edition(2025)])
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ConventionPage', () => {
  it('names the convention and shows its logo', async () => {
    view()

    expect(await screen.findByRole('heading', { name: 'Convention A', level: 1 })).toBeDefined()
    expect(document.title).toBe('Convention A · OPOS')
    expect(document.querySelector('img')!.getAttribute('src')).toMatch(
      /\/public\/tenants\/convention-a\/logo-files\/0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60\/large$/,
    )
  })

  it('shows its active edition as the page of that edition does, and leads to it', async () => {
    view()

    const active = await screen.findByRole('region', { name: 'Edition 2027' })
    expect(within(active).getByRole('link', { name: 'Edition 2027' }).getAttribute('href')).toBe(
      '/conventions/convention-a/2027',
    )
    expect(within(active).getByText('Jun 1 – 3, 2027')).toBeDefined()
    expect(within(active).getByText('Congress Hall')).toBeDefined()
    expect(within(active).getByText('Poznań')).toBeDefined()
    expect(
      within(active).getByRole('link', { name: 'See the programme' }).getAttribute('href'),
    ).toBe('/conventions/convention-a/2027/program')
  })

  it('links its other editions, the coming ones first, and not the active one', async () => {
    view()

    const others = await screen.findByRole('region', { name: 'Other editions' })
    const links = await within(others).findAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Edition 2028',
      'Edition 2026',
      'Edition 2025',
    ])
    expect(links[0]!.getAttribute('href')).toBe('/conventions/convention-a/2028')
  })

  it('says when no edition is active, without an error, and still lists the others', async () => {
    api.active.mockRejectedValue(notFound())
    api.editions.mockResolvedValue([edition(2025)])
    view()

    expect(await screen.findByText('No edition of this convention is active.')).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
    const others = await screen.findByRole('region', { name: 'Other editions' })
    expect(await within(others).findByRole('link', { name: 'Edition 2025' })).toBeDefined()
  })

  it('shows no list of other editions when the active one is the only one', async () => {
    api.editions.mockResolvedValue([edition(2027, true)])
    view()

    await screen.findByRole('region', { name: 'Edition 2027' })
    expect(screen.queryByRole('region', { name: 'Other editions' })).toBeNull()
  })

  it('shows the not-found screen for an unknown convention', async () => {
    api.convention.mockRejectedValue(notFound())
    api.active.mockRejectedValue(notFound())
    api.editions.mockRejectedValue(notFound())
    view()

    expect(await screen.findByRole('heading', { name: /not found|find/i })).toBeDefined()
    expect(document.title).toBe('Page not found · OPOS')
  })

  it('shows any other failure as an error', async () => {
    api.convention.mockRejectedValue(new ORPCError('server.error', { status: 500 }))
    view()

    expect(await screen.findByRole('alert')).toBeDefined()
  })
})
