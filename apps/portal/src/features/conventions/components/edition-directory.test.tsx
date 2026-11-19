import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionDirectory } from './edition-directory'

const api = vi.hoisted(() => ({
  coming: vi.fn<(after: string | undefined) => Promise<unknown>>(),
  past: vi.fn<(after: string | undefined) => Promise<unknown>>(),
}))

vi.mock('../api/conventions', () => ({
  editionListOptions: (period: 'coming' | 'past') => ({
    queryKey: ['edition-list', period],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => api[period](pageParam),
    initialPageParam: undefined,
    getNextPageParam: (page: { next: string | null }) => page.next ?? undefined,
  }),
}))

/** A page of the list as the API answers it: its rows, and the place the next one continues from. */
const page = (editions: object[], next: string | null = null) => ({ editions, next })

const logo = { fileId: '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60', width: 400, height: 200 }

const row = (slug: string, values: object = {}) => ({
  id: slug,
  slug,
  name: `Edition ${slug}`,
  startsAt: '2027-06-01T08:00:00.000Z',
  endsAt: '2027-06-03T18:00:00.000Z',
  venueCity: 'Poznań',
  tenant: { slug: 'convention-a', name: 'Convention A', timezone: 'Europe/Warsaw', logo: null },
  ...values,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <EditionDirectory />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const coming = () => screen.findByRole('region', { name: 'Coming editions' })
const past = () => screen.findByRole('region', { name: 'Past editions' })

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  api.coming.mockReset().mockResolvedValue(page([row('2027')]))
  api.past.mockReset().mockResolvedValue(page([row('2025')]))
})

afterEach(cleanup)

describe('EditionDirectory', () => {
  it('lists the coming editions and the past ones, each leading to its page', async () => {
    view()

    const link = await within(await coming()).findByRole('link', { name: 'Edition 2027' })
    expect(link.getAttribute('href')).toBe('/conventions/convention-a/2027')
    expect(
      (await within(await past()).findByRole('link', { name: 'Edition 2025' })).getAttribute(
        'href',
      ),
    ).toBe('/conventions/convention-a/2025')
    expect(within(await coming()).queryByRole('link', { name: 'Edition 2025' })).toBeNull()
  })

  it("shows a row's dates in the time zone of its convention, and its city", async () => {
    api.coming.mockResolvedValue(
      page([
        row('late', {
          // Still the last day of May in New York, already June in Warsaw.
          startsAt: '2027-05-31T22:30:00.000Z',
          endsAt: '2027-06-02T22:30:00.000Z',
          tenant: {
            slug: 'convention-b',
            name: 'Convention B',
            timezone: 'America/New_York',
            logo,
          },
        }),
      ]),
    )
    view()

    const item = (
      await within(await coming()).findByRole('link', { name: 'Edition late' })
    ).closest('li')!
    expect(within(item).getByText('May 31 – Jun 2, 2027')).toBeDefined()
    expect(within(item).getByText('Poznań')).toBeDefined()
  })

  it("shows the convention's logo small, with its place kept before it loads", async () => {
    api.coming.mockResolvedValue(
      page([
        row('2027', {
          tenant: { slug: 'convention-a', name: 'Convention A', timezone: 'Europe/Warsaw', logo },
        }),
      ]),
    )
    view()

    const item = (
      await within(await coming()).findByRole('link', { name: 'Edition 2027' })
    ).closest('li')!
    const image = item.querySelector('img')!
    expect(image.getAttribute('src')).toMatch(
      /\/public\/tenants\/convention-a\/logo-files\/0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60\/small$/,
    )
    expect(image.getAttribute('width')).toBe('48')
    expect(image.getAttribute('height')).toBe('24')
    // The row says whose edition it is in words: the picture adds nothing to read.
    expect(image.getAttribute('alt')).toBe('')
  })

  it('names the convention in a row whose edition does not say whose it is, and once in one that does', async () => {
    api.coming.mockResolvedValue(
      page([row('2027'), row('own', { name: 'Convention A, the spring edition' })]),
    )
    view()

    const anonymous = (
      await within(await coming()).findByRole('link', { name: 'Edition 2027' })
    ).closest('li')!
    expect(within(anonymous).getByText('Convention A')).toBeDefined()
    const named = within(await coming())
      .getByRole('link', { name: 'Convention A, the spring edition' })
      .closest('li')!
    expect(within(named).queryByText('Convention A')).toBeNull()
  })

  it('shows no picture for a convention with no logo, and no city for an edition with none', async () => {
    api.coming.mockResolvedValue(page([row('2027', { venueCity: null })]))
    view()

    const item = (
      await within(await coming()).findByRole('link', { name: 'Edition 2027' })
    ).closest('li')!
    expect(item.querySelector('img')).toBeNull()
    expect(within(item).queryByText('Poznań')).toBeNull()
  })

  it('reads more rows when asked, continuing after the last one, until a page comes short', async () => {
    api.coming
      .mockResolvedValueOnce(page([row('a'), row('b')], 'the place after b'))
      .mockResolvedValueOnce(page([row('c')]))
    view()

    const region = await coming()
    await within(region).findByRole('link', { name: 'Edition b' })
    expect(within(region).queryByRole('link', { name: 'Edition c' })).toBeNull()

    await userEvent.click(within(region).getByRole('button', { name: 'Show more' }))

    expect(await within(region).findByRole('link', { name: 'Edition c' })).toBeDefined()
    expect(api.coming).toHaveBeenLastCalledWith('the place after b')
    expect(within(region).queryByRole('button', { name: 'Show more' })).toBeNull()
    expect(within(await past()).queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('says when no edition is coming and when none has ended', async () => {
    api.coming.mockResolvedValue(page([]))
    api.past.mockResolvedValue(page([]))
    view()

    expect(await within(await coming()).findByText('No edition is coming yet.')).toBeDefined()
    expect(await within(await past()).findByText('No edition has ended yet.')).toBeDefined()
  })

  it('shows a failure of one part as an error, and the other part all the same', async () => {
    api.coming.mockRejectedValue(new ORPCError('server.error', { status: 500 }))
    view()

    expect(await within(await coming()).findByRole('alert')).toBeDefined()
    expect(await within(await past()).findByRole('link', { name: 'Edition 2025' })).toBeDefined()
  })
})
