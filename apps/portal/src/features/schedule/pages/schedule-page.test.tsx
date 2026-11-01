import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchedulePage } from './schedule-page'

const list = vi.hoisted(() => vi.fn())

vi.mock('../api/schedule', () => ({
  scheduleOptions: () => ({ queryKey: ['schedule'], queryFn: list }),
}))

const liked = (id: string, startsAt: string, timezone: string, slug: string) => ({
  id,
  title: `Item ${id}`,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
  edition: { slug: '2027', name: 'Edition 2027' },
  tenant: { slug, name: `Convention ${slug}`, timezone },
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <SchedulePage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  list.mockReset()
})

afterEach(cleanup)

describe('SchedulePage', () => {
  it('lists the liked items by day, each in the zone of its convention, with a link', async () => {
    list.mockResolvedValue([liked('a', '2027-06-01T22:30:00.000Z', 'Europe/Warsaw', 'warsaw')])
    view()

    expect(await screen.findByRole('heading', { name: 'Wednesday, June 2, 2027' })).toBeDefined()
    const link = screen.getByRole('link', { name: 'Item a' })
    expect(link.getAttribute('href')).toBe('/conventions/warsaw/2027/program/a')
    expect(screen.getByText('Convention warsaw, Edition 2027')).toBeDefined()
    expect(document.body.textContent).toContain('12:30')
  })

  it('points to the conventions when nothing is liked yet', async () => {
    list.mockResolvedValue([])
    view()

    expect(await screen.findByText('You have not liked any programme items yet.')).toBeDefined()
  })

  it('shows a failure as an error', async () => {
    list.mockRejectedValue(new Error('down'))
    view()

    expect(await screen.findByRole('alert')).toBeDefined()
  })
})
