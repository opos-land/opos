import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminGate } from './admin-gate'

const load = vi.fn<() => Promise<unknown>>()

vi.mock('../../conventions', () => ({
  conventionsOptions: () => ({
    queryKey: ['admin', 'tenants'],
    queryFn: () => load(),
    retry: false,
  }),
}))

const renderGate = () =>
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <AdminGate>
          <p>the screens of an admin</p>
        </AdminGate>
      </QueryClientProvider>
    </I18nProvider>,
  )

const refusal = (code: string, status = 403) => new ORPCError(code, { status })

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  load.mockReset()
})

afterEach(cleanup)

describe('AdminGate', () => {
  it('lets an admin through to the screens', async () => {
    load.mockResolvedValue([])
    renderGate()

    expect(await screen.findByText('the screens of an admin')).toBeTruthy()
  })

  it('shows nothing of the screens while the API is asked', () => {
    load.mockReturnValue(new Promise(() => {}))
    renderGate()

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('the screens of an admin')).toBeNull()
  })

  it.each([
    ['permission.denied', 'This account is not an administrator', /Only administrators of OPOS/],
    [
      'admin.mfa-not-enabled',
      'Two-factor authentication is off',
      /Turn it on in the portal, then ask for the role to be granted again/,
    ],
    [
      'admin.grant-outdated',
      'The administrator role has to be granted again',
      /has changed since the administrator role was granted/,
    ],
  ])('says so, on one screen, to an account refused with %s', async (code, heading, text) => {
    load.mockRejectedValue(refusal(code))
    renderGate()

    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy()
    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.queryByText('the screens of an admin')).toBeNull()
    // Nothing to press here: the way out is the frame's sign-out.
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('shows a failure that is no refusal, and asks again on request', async () => {
    load.mockRejectedValueOnce(refusal('server.unavailable', 503)).mockResolvedValue([])
    renderGate()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('the screens of an admin')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('the screens of an admin')).toBeTruthy()
  })

  // The query client leads such a session back to sign-in; no message flashes meanwhile.
  it('shows only that it waits for a sign-in grown too old', async () => {
    load.mockRejectedValue(refusal('session.reauthentication-required', 401))
    renderGate()

    await vi.waitFor(() => expect(load).toHaveBeenCalled())
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('the screens of an admin')).toBeNull()
  })
})
