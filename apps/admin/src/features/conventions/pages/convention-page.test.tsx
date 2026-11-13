import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type AdminTenantDetails } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConventionPage } from './convention-page'

const load = vi.fn<() => Promise<unknown>>()
const rename = vi.fn<(input: unknown) => Promise<unknown>>()
const suspend = vi.fn<(input: unknown) => Promise<unknown>>()
const restore = vi.fn<(input: unknown) => Promise<unknown>>()

vi.mock('../api/conventions', () => ({
  adminKey: () => ['admin'],
  conventionOptions: (id: string) => ({
    queryKey: ['admin', 'tenant', id],
    queryFn: () => load(),
    retry: false,
  }),
  renameConventionOptions: () => ({ mutationFn: (input: unknown) => rename(input) }),
  suspendConventionOptions: () => ({ mutationFn: (input: unknown) => suspend(input) }),
  restoreConventionOptions: () => ({ mutationFn: (input: unknown) => restore(input) }),
  deleteConventionOptions: () => ({ mutationFn: () => Promise.resolve() }),
}))

const convention = (override: Partial<AdminTenantDetails> = {}): AdminTenantDetails => ({
  id: 'c-1',
  slug: 'convention-a',
  name: 'Convention A',
  defaultLocale: 'pl',
  timezone: 'Europe/Warsaw',
  suspendedAt: null,
  createdAt: '2026-03-01T10:00:00.000Z',
  heads: [
    { accountId: 'h-1', email: 'anna@example.test', firstName: 'Anna', lastName: 'Nowak' },
    { accountId: 'h-2', email: 'nameless@example.test', firstName: null, lastName: null },
  ],
  ...override,
})

function renderPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/conventions/c-1']}>
          <Routes>
            <Route path="/conventions/:conventionId" element={<ConventionPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return userEvent.setup()
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  for (const mock of [load, rename, suspend, restore]) mock.mockReset()
})

afterEach(cleanup)

describe('ConventionPage', () => {
  it('shows the convention, its address and its head organizers, by name and email address', async () => {
    load.mockResolvedValue(convention())
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Convention A' })).toBeTruthy()
    expect(screen.getByText('convention-a')).toBeTruthy()
    expect(screen.getByText(/Anna Nowak/)).toBeTruthy()
    expect(screen.getByText(/anna@example\.test/)).toBeTruthy()
    expect(screen.getByText('nameless@example.test')).toBeTruthy()
    expect(document.title).toBe('Convention A · OPOS administration')
  })

  it('says that no email goes to the head organizers', async () => {
    load.mockResolvedValue(convention())
    renderPage()

    expect(await screen.findByText(/No email goes to them/)).toBeTruthy()
  })

  it('changes the address once it differs, with the convention the page shows', async () => {
    load.mockResolvedValue(convention())
    rename.mockResolvedValue(convention({ slug: 'moved' }))
    const user = renderPage()

    const button = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Change the address',
    })
    expect(button.disabled).toBe(true)
    await user.clear(screen.getByRole('textbox', { name: 'Address' }))
    await user.type(screen.getByRole('textbox', { name: 'Address' }), 'moved')
    await user.click(button)

    await vi.waitFor(() =>
      expect(rename).toHaveBeenCalledWith({ params: { tenantId: 'c-1' }, body: { slug: 'moved' } }),
    )
  })

  it('refuses a malformed address beside the field and sends nothing', async () => {
    load.mockResolvedValue(convention())
    const user = renderPage()

    await user.clear(await screen.findByRole('textbox', { name: 'Address' }))
    await user.type(screen.getByRole('textbox', { name: 'Address' }), 'Bad_Slug')
    await user.click(screen.getByRole('button', { name: 'Change the address' }))

    expect(
      await screen.findByText('Use 3 to 40 lowercase letters, digits and hyphens.'),
    ).toBeTruthy()
    expect(rename).not.toHaveBeenCalled()
  })

  it('suspends at one press, saying first what a suspension turns off, and offers no deletion yet', async () => {
    load.mockResolvedValue(convention())
    suspend.mockResolvedValue(convention({ suspendedAt: '2026-04-01T08:00:00.000Z' }))
    const user = renderPage()

    expect(await screen.findByText(/off for everyone but the administrators/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete the convention' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Deletion' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Suspend the convention' }))

    await vi.waitFor(() => expect(suspend).toHaveBeenCalledWith({ params: { tenantId: 'c-1' } }))
    // Reversed on this same screen, so no modal asked.
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows a suspended convention as such, restores it at one press and offers its deletion', async () => {
    load.mockResolvedValue(
      convention({ timezone: 'America/Los_Angeles', suspendedAt: '2026-04-01T03:30:00.000Z' }),
    )
    restore.mockResolvedValue(convention())
    const user = renderPage()

    expect(await screen.findByText('Suspended')).toBeTruthy()
    // In the convention's own time zone, where it is still the day before.
    expect(screen.getByText(/Suspended since Mar 31, 2026, 8:30 PM\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete the convention' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Restore the convention' }))

    await vi.waitFor(() => expect(restore).toHaveBeenCalledWith({ params: { tenantId: 'c-1' } }))
  })

  it.each(['request.not-found', 'request.invalid'])(
    'shows "not found" for an identifier the API answers %s',
    async (code) => {
      load.mockRejectedValue(new ORPCError(code, { status: 404 }))
      renderPage()

      expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
    },
  )

  it('shows another failure as it is', async () => {
    load.mockRejectedValue(new ORPCError('server.unavailable', { status: 503 }))
    renderPage()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
  })
})
