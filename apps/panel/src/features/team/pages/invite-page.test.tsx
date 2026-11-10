import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { InvitePage } from './invite-page'

const access = vi.hoisted(() => ({ settings: 'none', isHead: false }))

vi.mock('../../editions', () => ({ useEditions: () => ({ data: [] }) }))
vi.mock('../../tenants', async () => {
  const { NoPermissionView } = await import('../../../shared/ui')
  const levels = ['none', 'read', 'write']
  return {
    atLeast: (held: string, needed: string) => levels.indexOf(held) >= levels.indexOf(needed),
    RequireAccess: ({ allowed, children }: { allowed: boolean; children: ReactNode }) =>
      allowed ? children : <NoPermissionView />,
    useCurrentTenant: () => ({
      tenant: { slug: 'convention-a', name: 'Convention A' },
      access,
      api: {},
    }),
    useTenantTime: () => ({ timeZone: 'Europe/Warsaw', format: String, fromInput: () => null }),
  }
})
vi.mock('../api/members', () => ({
  inviteMemberOptions: () => ({ mutationFn: vi.fn() }),
  membersKey: () => ['members'],
}))

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <InvitePage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

describe('InvitePage', () => {
  it('is closed to a member who only reads the settings', () => {
    access.settings = 'read'
    view()

    expect(screen.getByRole('heading', { name: /permissions/i })).toBeDefined()
    expect(screen.queryByLabelText('Email')).toBeNull()
  })

  it('holds the invitation and the way back to the team', () => {
    access.settings = 'write'
    view()

    expect(screen.getByRole('heading', { name: 'Invite to the team', level: 1 })).toBeDefined()
    expect(screen.getByRole('region', { name: 'Invitation' })).toBeDefined()
    expect(screen.getByLabelText('Email')).toBeDefined()
    const back = screen.getByRole('link', { name: 'Back to the team' })
    expect(back.getAttribute('href')).toBe('/convention-a/settings/team')
    expect(document.title).toBe('Invite to the team · Convention A · OPOS panel')
  })
})
