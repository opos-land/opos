import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditions } from '../../editions'
import { InviteForm } from './invite-form'

vi.mock('../../editions', () => ({ useEditions: vi.fn() }))
vi.mock('../../tenants', () => ({
  useCurrentTenant: () => ({ access: { isHead: true }, api: {} }),
  useTenantTime: () => ({ timeZone: 'Europe/Warsaw', format: String, fromInput: () => null }),
}))
vi.mock('../api/members', () => ({
  inviteMemberOptions: () => ({ mutationFn: vi.fn() }),
  membersKey: () => ['members'],
}))

const spring = { id: 'edition-1', name: 'Spring edition' }

function setEditions(data: (typeof spring)[] | undefined) {
  vi.mocked(useEditions).mockReturnValue({ data } as unknown as ReturnType<typeof useEditions>)
}

const ui = () => (
  <QueryClientProvider client={new QueryClient()}>
    <I18nProvider i18n={i18n}>
      <InviteForm />
    </I18nProvider>
  </QueryClientProvider>
)

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  vi.mocked(useEditions).mockReset()
})

afterEach(cleanup)

describe('InviteForm', () => {
  it('keeps what was typed when the editions arrive after it', async () => {
    const user = userEvent.setup()
    setEditions(undefined)
    const { rerender } = render(ui())

    await user.type(screen.getByLabelText('Email'), 'new@x.test')
    setEditions([spring])
    rerender(ui())

    expect(await screen.findByLabelText('Programme in Spring edition')).toBeDefined()
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('new@x.test')
  })
})
