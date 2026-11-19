import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionProgramPage } from './edition-program-page'

const api = vi.hoisted(() => ({ convention: vi.fn(), edition: vi.fn(), items: vi.fn() }))

vi.mock('../api/conventions', () => ({
  conventionOptions: () => ({ queryKey: ['convention'], queryFn: api.convention }),
  editionOptions: () => ({ queryKey: ['edition'], queryFn: api.edition }),
  programItemsOptions: () => ({ queryKey: ['items'], queryFn: api.items }),
}))

const notFound = () => new ORPCError('request.not-found', { status: 404 })

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
        <MemoryRouter initialEntries={['/conventions/convention-a/2027/program']}>
          <Routes>
            <Route
              path="/conventions/:tenantSlug/:editionSlug/program"
              element={<EditionProgramPage />}
            />
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
    logo: null,
  })
  api.edition.mockReset().mockResolvedValue({
    id: 'e-2027',
    slug: '2027',
    name: 'Convention A 2027',
    startsAt: '2027-06-01T08:00:00.000Z',
    endsAt: '2027-06-03T18:00:00.000Z',
    isActive: true,
    venueName: null,
    venueAddress: null,
    venueCity: null,
  })
  api.items.mockReset().mockResolvedValue([item('late', '2027-06-01T22:30:00.000Z', 2)])
})

afterEach(cleanup)

describe('EditionProgramPage', () => {
  it("shows the edition's programme by the day of the convention's zone", async () => {
    view()

    expect(await screen.findByRole('heading', { name: 'Programme', level: 1 })).toBeDefined()
    expect(document.title).toBe('Programme · Convention A 2027 · OPOS')
    expect(await screen.findByRole('heading', { name: 'Wednesday, June 2, 2027' })).toBeDefined()
    const link = screen.getByRole('link', { name: 'Item late' })
    expect(link.getAttribute('href')).toBe('/conventions/convention-a/2027/program/late')
    expect(screen.getByText('2 likes')).toBeDefined()
  })

  it("leads back to the edition's page", async () => {
    view()

    const link = await screen.findByRole('link', { name: 'Back to Convention A 2027' })
    expect(link.getAttribute('href')).toBe('/conventions/convention-a/2027')
  })

  it('says when the edition has no programme yet', async () => {
    api.items.mockResolvedValue([])
    view()

    expect(await screen.findByText('There is no programme yet.')).toBeDefined()
  })

  it('shows the not-found screen for an unknown or unpublished edition, asking for no programme', async () => {
    api.edition.mockRejectedValue(notFound())
    view()

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeDefined()
    expect(api.items).not.toHaveBeenCalled()
  })

  it('shows any other failure as an error', async () => {
    api.items.mockRejectedValue(new ORPCError('server.error', { status: 500 }))
    view()

    expect(await screen.findByRole('alert')).toBeDefined()
  })
})
