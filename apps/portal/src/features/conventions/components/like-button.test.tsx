import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LikeButton } from './like-button'

const api = vi.hoisted(() => {
  const session: { status: string; account: object | null } = { status: 'ready', account: {} }
  return { like: vi.fn(), unlike: vi.fn(), liked: vi.fn(), session }
})

vi.mock('../../../shared/lib/session', () => ({
  useSession: (select: (state: typeof api.session) => unknown) => select(api.session),
}))
vi.mock('../../schedule', () => ({
  scheduleOptions: () => ({ queryKey: ['schedule'], queryFn: api.liked }),
}))
vi.mock('../api/conventions', () => ({
  likeOptions: () => ({ mutationFn: api.like }),
  unlikeOptions: () => ({ mutationFn: api.unlike }),
  publicKey: () => ['public'],
}))

const params = { editionId: 'edition-1', programItemId: 'item-1' }

const view = (props: { ended?: boolean } = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/conventions/a/2027/program/item-1']}>
          <LikeButton tenantSlug="a" ended={props.ended ?? false} {...params} />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  api.session.status = 'ready'
  api.session.account = {}
  api.like.mockReset().mockResolvedValue(undefined)
  api.unlike.mockReset().mockResolvedValue(undefined)
  api.liked.mockReset().mockResolvedValue([])
})

afterEach(cleanup)

describe('LikeButton', () => {
  it('likes an item not liked yet', async () => {
    const user = userEvent.setup()
    view()

    await user.click(await screen.findByRole('button', { name: 'Like' }))

    expect(api.like.mock.calls[0]?.[0]).toEqual({ params })
  })

  it('takes a like away', async () => {
    const user = userEvent.setup()
    api.liked.mockResolvedValue([{ id: 'item-1' }])
    view()

    await user.click(await screen.findByRole('button', { name: 'Remove the like' }))

    expect(api.unlike.mock.calls[0]?.[0]).toEqual({ params })
  })

  it('sends a signed-out visitor to sign in, and back to this page', () => {
    api.session.account = null
    view()

    const link = screen.getByRole('link', { name: 'Sign in to like this item' })
    expect(link.getAttribute('href')).toBe(
      `/login?redirect=${encodeURIComponent('/conventions/a/2027/program/item-1')}`,
    )
    expect(api.liked).not.toHaveBeenCalled()
  })

  it('keeps the way to sign-in while the API could not say who is signed in', () => {
    api.session.status = 'unavailable'
    api.session.account = null
    view()

    expect(screen.getByRole('link', { name: 'Sign in to like this item' })).toBeTruthy()
  })

  it('shows nothing while the account is still being asked for', () => {
    api.session.status = 'loading'
    api.session.account = null
    view()

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers no new like once the edition has ended', async () => {
    view({ ended: true })

    await vi.waitFor(() => expect(api.liked).toHaveBeenCalled())
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('still lets a like go once the edition has ended', async () => {
    api.liked.mockResolvedValue([{ id: 'item-1' }])
    view({ ended: true })

    expect(await screen.findByRole('button', { name: 'Remove the like' })).toBeDefined()
  })

  it('asks a signed-out visitor nothing once the edition has ended', () => {
    api.session.account = null
    view({ ended: true })

    expect(screen.queryByRole('link')).toBeNull()
  })
})
