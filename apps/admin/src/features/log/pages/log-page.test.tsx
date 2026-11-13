import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type AdminAction } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LogPage } from './log-page'

const load = vi.fn<(before: string | undefined) => Promise<AdminAction[]>>()

vi.mock('../api/log', () => ({
  logOptions: () => ({
    queryKey: ['admin', 'actions'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => load(pageParam),
    initialPageParam: undefined,
    // Two entries a page here, where the application asks for fifty.
    getNextPageParam: (page: AdminAction[]) => (page.length < 2 ? undefined : page.at(-1)?.id),
    retry: false,
  }),
}))

const ada = { id: 'a-1', email: 'ada@example.test', firstName: 'Ada', lastName: 'Admin' }

const entry = (override: Partial<AdminAction>): AdminAction => ({
  id: 'e-1',
  action: 'tenant.suspend',
  admin: ada,
  tenant: { id: 't-1', slug: 'convention-a' },
  account: null,
  createdAt: '2026-05-01T12:00:00.000Z',
  ...override,
})

function renderPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <LogPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return userEvent.setup()
}

const rows = () => screen.getAllByRole('row').slice(1)

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  load.mockReset()
})

afterEach(cleanup)

describe('LogPage', () => {
  it('lists who did what, on which convention, and when', async () => {
    load.mockResolvedValue([entry({})])
    renderPage()

    const [row] = await vi.waitFor(() => rows())
    expect(within(row!).getByText('Ada Admin (ada@example.test)')).toBeTruthy()
    expect(within(row!).getByText('Suspended the convention')).toBeTruthy()
    expect(within(row!).getByText('convention-a')).toBeTruthy()
    expect(within(row!).getByText(/2026/)).toBeTruthy()
    expect(document.title).toBe('Log · OPOS administration')
  })

  it('names a script for a grant of the administrator role, and the account it was granted to', async () => {
    load.mockResolvedValue([
      entry({
        action: 'admin.grant',
        admin: null,
        tenant: null,
        account: { id: 'a-2', email: 'greta@example.test', firstName: null, lastName: null },
      }),
    ])
    renderPage()

    const [row] = await vi.waitFor(() => rows())
    expect(within(row!).getByText('a script on the server')).toBeTruthy()
    expect(within(row!).getByText('Granted the administrator role')).toBeTruthy()
    expect(within(row!).getByText('greta@example.test')).toBeTruthy()
  })

  it('names the first head organizer beside a created convention', async () => {
    load.mockResolvedValue([
      entry({
        action: 'tenant.create',
        account: { id: 'h-1', email: 'head@example.test', firstName: 'Hanna', lastName: null },
      }),
    ])
    renderPage()

    const [row] = await vi.waitFor(() => rows())
    expect(within(row!).getByText('Created the convention')).toBeTruthy()
    expect(row!.textContent).toContain('convention-a · Hanna (head@example.test)')
  })

  it('says of an account deleted since only that, for an entry holds no address', async () => {
    load.mockResolvedValue([
      entry({
        action: 'account.reset-2fa',
        admin: { id: 'a-9', email: null, firstName: null, lastName: null },
        tenant: null,
        account: { id: 'a-8', email: null, firstName: null, lastName: null },
      }),
    ])
    renderPage()

    const [row] = await vi.waitFor(() => rows())
    expect(within(row!).getAllByText('an account deleted since')).toHaveLength(2)
    expect(within(row!).getByText('Reset two-factor authentication')).toBeTruthy()
  })

  it('reads on, a page at a time, while there are older entries', async () => {
    load
      .mockResolvedValueOnce([entry({ id: 'e-4' }), entry({ id: 'e-3', action: 'tenant.restore' })])
      .mockResolvedValueOnce([entry({ id: 'e-2', action: 'tenant.rename' })])
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Show older entries' }))

    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    expect(load.mock.calls.map(([before]) => before)).toEqual([undefined, 'e-3'])
    // The last page was short: nothing older is left.
    expect(screen.queryByRole('button', { name: 'Show older entries' })).toBeNull()
  })

  it('offers nothing to change or remove', async () => {
    load.mockResolvedValue([entry({})])
    renderPage()

    await vi.waitFor(() => rows())
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryAllByRole('textbox')).toEqual([])
  })

  it('says that nothing has been recorded instead of an empty table', async () => {
    load.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('Nothing has been recorded yet.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows a failure as it is', async () => {
    load.mockRejectedValue(new ORPCError('server.unavailable', { status: 503 }))
    renderPage()

    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})
