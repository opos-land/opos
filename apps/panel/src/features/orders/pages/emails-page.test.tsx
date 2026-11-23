import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailsPage } from './emails-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readEmails = vi.hoisted(() => vi.fn())
const asked = vi.hoisted(() => ({ queries: [] as object[] }))

vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A', timezone: 'Europe/Warsaw' },
    access: {
      edition: () => ({ program: 'none', websiteContent: 'none', tickets: state.tickets }),
    },
    api: {},
  }),
  useTenantTime: () => ({ format: (iso: string) => `at ${iso}` }),
}))
vi.mock('../../editions', () => ({
  useEditionBySlug: () => ({
    isPending: false,
    isError: false,
    error: null,
    edition: { id: 'edition-2026', slug: '2026', name: 'Edition 2026' },
  }),
}))
vi.mock('../api/orders', () => ({
  emailsOptions: (_: unknown, editionId: string, query: object) => ({
    queryKey: ['orders', 'emails', editionId, query],
    queryFn: () => {
      asked.queries.push(query)
      return readEmails(query) as unknown
    },
  }),
}))

const email = (id: string, fields: object = {}) => ({
  id,
  kind: 'order-confirmation',
  recipient: 'buyer@example.test',
  queuedAt: '2026-05-01T10:05:01.000Z',
  sentAt: '2026-05-01T10:05:10.000Z',
  withdrawnAt: null,
  failedAttempts: 0,
  order: { id: 'order-1', number: 'ABCDEFGHJK' },
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/emails']}>
          <Routes>
            <Route path="/:tenantSlug/editions/:editionSlug/emails" element={<EmailsPage />} />
            <Route
              path="/:tenantSlug/editions/:editionSlug/emails/:emailId"
              element={<p>the page of the email</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const rows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    )

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'read'
  asked.queries = []
  readEmails.mockResolvedValue({ emails: [], total: 0 })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the emails page', () => {
  it('shows nothing of the emails to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readEmails).not.toHaveBeenCalled()
  })

  it('lists the emails in a table: what each tells, to whom, of which order and when it went out', async () => {
    readEmails.mockResolvedValue({
      emails: [
        email('sent'),
        email('alert', { kind: 'needs-review', recipient: null }),
        email('waiting', { kind: 'order-expired', sentAt: null }),
        email('failing', { kind: 'order-link', sentAt: null, failedAttempts: 3 }),
        email('stale', { sentAt: null, withdrawnAt: '2026-05-02T08:00:00.000Z' }),
      ],
      total: 5,
    })

    view()

    await screen.findByRole('table')
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Email', 'To', 'Order', 'Sent'])
    expect(rows()).toEqual([
      [
        'Confirmation with the QR code',
        'buyer@example.test',
        'ABCDEFGHJK',
        'at 2026-05-01T10:05:10.000Z',
      ],
      [
        'Alert: the order needs review',
        'The organizers',
        'ABCDEFGHJK',
        'at 2026-05-01T10:05:10.000Z',
      ],
      ['The order expired', 'buyer@example.test', 'ABCDEFGHJK', 'Waiting to be sent'],
      ['A new order link', 'buyer@example.test', 'ABCDEFGHJK', 'Not sent yet: it is tried again'],
      [
        'Confirmation with the QR code',
        'buyer@example.test',
        'ABCDEFGHJK',
        'Not sent: the order moved to another address before it went out',
      ],
    ])
    expect(asked.queries.at(-1)).toEqual({ offset: 0, limit: 50 })
  })

  it('opens the page of an email from anywhere in its row', async () => {
    readEmails.mockResolvedValue({ emails: [email('email-1')], total: 1 })
    view()

    const link = await screen.findByRole('link', { name: 'Confirmation with the QR code' })
    expect(link.getAttribute('href')).toBe('/convention-a/editions/2026/emails/email-1')
    fireEvent.click(screen.getByText('buyer@example.test'))

    expect(await screen.findByText('the page of the email')).toBeDefined()
  })

  it('searches by what is typed, from the first page', async () => {
    readEmails.mockResolvedValue({
      emails: Array.from({ length: 50 }, (_, index) => email(`email-${index}`)),
      total: 120,
    })
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(asked.queries.at(-1)).toEqual({ offset: 50, limit: 50 }))

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: ' ada@example ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() =>
      expect(asked.queries.at(-1)).toEqual({ q: 'ada@example', offset: 0, limit: 50 }),
    )
    // Emptied, the search is no search.
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(asked.queries.at(-1)).toEqual({ offset: 0, limit: 50 }))
  })

  it('reads the emails a page at a time, and says which ones it shows', async () => {
    readEmails.mockImplementation(({ offset }: { offset: number }) =>
      Promise.resolve({
        emails: Array.from({ length: offset === 100 ? 20 : 50 }, (_, index) =>
          email(`email-${offset + index}`),
        ),
        total: 120,
      }),
    )
    view()

    expect(await screen.findByText('Emails 1–50 of 120')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByText('Emails 51–100 of 120')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByText('Emails 101–120 of 120')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(await screen.findByText('Emails 51–100 of 120')).toBeDefined()
  })

  it('says that the orders sent no email yet, and that a search found none', async () => {
    view()

    expect(await screen.findByText('The orders of this edition sent no email yet.')).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'nobody' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('No email matches.')).toBeDefined()
  })
})
