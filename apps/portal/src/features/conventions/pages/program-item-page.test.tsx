import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgramItemPage } from './program-item-page'

const api = vi.hoisted(() => ({ convention: vi.fn(), item: vi.fn(), edition: vi.fn() }))

vi.mock('../api/conventions', () => ({
  conventionOptions: () => ({ queryKey: ['convention'], queryFn: api.convention }),
  programItemOptions: () => ({ queryKey: ['item'], queryFn: api.item }),
  editionOptions: () => ({ queryKey: ['edition'], queryFn: api.edition }),
}))
vi.mock('../components/like-button', () => ({
  LikeButton: ({ editionId, ended }: { editionId: string; ended: boolean }) => (
    <p>{`like in ${editionId}, ${ended ? 'ended' : 'open'}`}</p>
  ),
}))

const panel = {
  id: 'item-1',
  title: 'A panel on maps',
  description: 'Coastlines and rivers.',
  startsAt: '2027-06-02T08:00:00.000Z',
  endsAt: '2027-06-02T09:00:00.000Z',
  speakers: [{ firstName: 'Kasia', lastName: 'Mazur' }],
  likeCount: 1,
}

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/conventions/convention-a/2027/program/item-1']}>
          <Routes>
            <Route
              path="/conventions/:tenantSlug/:editionSlug/program/:programItemId"
              element={<ProgramItemPage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

/** How many times the page says this date. */
const mentions = (date: string) =>
  [...(document.body.textContent ?? '').matchAll(new RegExp(date, 'g'))].length

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  api.convention.mockReset().mockResolvedValue({
    name: 'Convention A',
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
  })
  api.item.mockReset().mockResolvedValue(panel)
  api.edition.mockReset().mockResolvedValue({
    id: 'edition-1',
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
  })
})

afterEach(cleanup)

describe('ProgramItemPage', () => {
  it('shows the details, with the time in the zone of the convention', async () => {
    view()

    expect(await screen.findByRole('heading', { name: 'A panel on maps', level: 1 })).toBeDefined()
    expect(screen.getByText('Coastlines and rivers.')).toBeDefined()
    expect(screen.getByText('Speaker: Kasia Mazur')).toBeDefined()
    expect(screen.getByText('1 like')).toBeDefined()
    expect(document.body.textContent).toContain('10:00')
    expect(mentions('June 2, 2027')).toBe(1)
  })

  it('says each date once for an item that runs past midnight in that zone', async () => {
    api.item.mockResolvedValue({
      ...panel,
      startsAt: '2027-06-02T21:00:00.000Z',
      endsAt: '2027-06-02T23:30:00.000Z',
    })
    view()

    await screen.findByRole('heading', { name: 'A panel on maps', level: 1 })
    expect(mentions('June 2, 2027')).toBe(1)
    expect(mentions('June 3, 2027')).toBe(1)
  })

  it('offers the like of an edition still running, and says when it has ended', async () => {
    view()
    expect(await screen.findByText('like in edition-1, open')).toBeDefined()
    cleanup()

    api.edition.mockResolvedValue({
      id: 'edition-1',
      endsAt: new Date(Date.now() - 1000).toISOString(),
    })
    view()
    expect(await screen.findByText('like in edition-1, ended')).toBeDefined()
  })

  it('names every speaker with the plural label', async () => {
    api.item.mockResolvedValue({
      ...panel,
      speakers: [
        { firstName: 'Kasia', lastName: 'Mazur' },
        { firstName: 'Jan', lastName: 'Kowal' },
      ],
    })
    view()

    expect(await screen.findByText('Speakers: Kasia Mazur, Jan Kowal')).toBeDefined()
  })

  it('shows the not-found screen for an unknown item', async () => {
    api.item.mockRejectedValue(new ORPCError('request.not-found', { status: 404 }))
    view()

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeDefined()
  })
})
