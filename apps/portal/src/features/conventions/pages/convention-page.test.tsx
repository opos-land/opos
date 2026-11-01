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
  items: vi.fn(),
}))

vi.mock('../api/conventions', () => ({
  conventionOptions: () => ({ queryKey: ['convention'], queryFn: api.convention }),
  activeEditionOptions: () => ({ queryKey: ['active'], queryFn: api.active }),
  editionsOptions: () => ({ queryKey: ['editions'], queryFn: api.editions }),
  programItemsOptions: () => ({ queryKey: ['items'], queryFn: api.items }),
}))

const notFound = () => new ORPCError('request.not-found', { status: 404 })

const edition = (slug: string, isActive: boolean) => ({
  id: slug,
  slug,
  name: `Edition ${slug}`,
  startsAt: '2027-06-01T08:00:00.000Z',
  endsAt: '2027-06-03T18:00:00.000Z',
  isActive,
})

const item = (id: string, startsAt: string, likeCount = 0) => ({
  id,
  title: `Item ${id}`,
  description: null,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
  speakers: [{ firstName: 'Kasia', lastName: 'Mazur' }],
  likeCount,
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
  api.convention.mockReset().mockResolvedValue({
    name: 'Convention A',
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
  })
  api.active.mockReset().mockResolvedValue(edition('2027', true))
  api.editions.mockReset().mockResolvedValue([edition('2027', true), edition('2025', false)])
  api.items.mockReset().mockResolvedValue([item('late', '2027-06-01T22:30:00.000Z', 2)])
})

afterEach(cleanup)

describe('ConventionPage', () => {
  it("shows the active edition's programme by the day of the convention's zone", async () => {
    view()

    expect(await screen.findByRole('heading', { name: 'Convention A', level: 1 })).toBeDefined()
    expect(await screen.findByRole('heading', { name: 'Wednesday, June 2, 2027' })).toBeDefined()
    const link = screen.getByRole('link', { name: 'Item late' })
    expect(link.getAttribute('href')).toBe('/conventions/convention-a/2027/program/late')
    expect(screen.getByText('Speaker: Kasia Mazur')).toBeDefined()
    expect(screen.getByText('2 likes')).toBeDefined()
  })

  it('links the other editions, and not the active one', async () => {
    view()

    const others = await screen.findByRole('region', { name: 'Other editions' })
    const link = within(others).getByRole('link', { name: 'Edition 2025' })
    expect(link.getAttribute('href')).toBe('/conventions/convention-a/2025')
    expect(within(others).queryByRole('link', { name: 'Edition 2027' })).toBeNull()
  })

  it('says when no edition is active, without an error', async () => {
    api.active.mockRejectedValue(notFound())
    view()

    expect(await screen.findByText('No edition of this convention is active.')).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(api.items).not.toHaveBeenCalled()
  })

  it('says when the active edition has no programme yet', async () => {
    api.items.mockResolvedValue([])
    view()

    expect(await screen.findByText('There is no programme yet.')).toBeDefined()
  })

  it('shows the not-found screen for an unknown convention', async () => {
    api.convention.mockRejectedValue(notFound())
    api.active.mockRejectedValue(notFound())
    api.editions.mockRejectedValue(notFound())
    view()

    expect(await screen.findByRole('heading', { name: /not found|find/i })).toBeDefined()
  })

  it('shows any other failure as an error', async () => {
    api.convention.mockRejectedValue(new ORPCError('server.error', { status: 500 }))
    view()

    expect(await screen.findByRole('alert')).toBeDefined()
  })
})
