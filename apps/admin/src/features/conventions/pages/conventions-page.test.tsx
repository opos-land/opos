import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type AdminTenant } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ConventionsPage } from './conventions-page'

vi.mock('../api/conventions', () => ({
  conventionsOptions: () => ({ queryKey: ['admin', 'tenants'] }),
}))

const convention = (override: Partial<AdminTenant>): AdminTenant => ({
  id: '00000000-0000-4000-8000-00000000000a',
  slug: 'convention-a',
  name: 'Convention A',
  defaultLocale: 'pl',
  timezone: 'Europe/Warsaw',
  suspendedAt: null,
  createdAt: '2026-03-01T10:00:00.000Z',
  ...override,
})

function renderPage(conventions: AdminTenant[]) {
  const client = new QueryClient()
  // AdminGate has the answer before the page renders.
  client.setQueryData(['admin', 'tenants'], conventions)
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ConventionsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

describe('ConventionsPage', () => {
  it('lists every convention with its address and whether it is suspended', () => {
    renderPage([
      convention({}),
      convention({
        id: '00000000-0000-4000-8000-00000000000b',
        slug: 'convention-b',
        name: 'Convention B',
        suspendedAt: '2026-04-01T08:00:00.000Z',
      }),
    ])

    expect(screen.getByRole('heading', { name: 'Conventions' })).toBeTruthy()
    const [, first, second] = screen.getAllByRole('row')
    expect(within(first!).getByText('Convention A')).toBeTruthy()
    expect(within(first!).getByText('convention-a')).toBeTruthy()
    expect(within(first!).getByText('Active')).toBeTruthy()
    expect(within(second!).getByText('convention-b')).toBeTruthy()
    expect(within(second!).getByText('Suspended')).toBeTruthy()
  })

  it('says when each was created, as a date the reader can read', () => {
    renderPage([convention({})])

    const [, row] = screen.getAllByRole('row')
    expect(within(row!).getByText(/2026/)).toBeTruthy()
    expect(within(row!).queryByText('2026-03-01T10:00:00.000Z')).toBeNull()
  })

  it('says that there is none yet instead of an empty table', () => {
    renderPage([])

    expect(screen.getByText('No convention has been created yet.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('names itself in the browser tab', () => {
    renderPage([])

    expect(document.title).toBe('Conventions · OPOS administration')
  })
})
