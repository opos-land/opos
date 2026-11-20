import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailPage } from './email-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readEmail = vi.hoisted(() => vi.fn())

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
  emailOptions: (_: unknown, editionId: string, emailId: string) => ({
    queryKey: ['orders', 'email', editionId, emailId],
    queryFn: () => readEmail({ editionId, emailId }) as unknown,
  }),
}))

const BODY = [
  'Thank you. Your order ABCDEFGHJK for Convention A is paid.',
  'The QR code of the order ABCDEFGHJK: […]',
  'See your order: https://portal.test/order#[…]',
  'OPOS',
].join('\n\n')

const email = (fields: object = {}) => ({
  id: 'email-1',
  kind: 'order-confirmation',
  recipient: 'buyer@example.test',
  queuedAt: '2026-05-01T10:05:01.000Z',
  sentAt: '2026-05-01T10:05:10.000Z',
  withdrawnAt: null,
  failedAttempts: 0,
  order: { id: 'order-1', number: 'ABCDEFGHJK' },
  subject: 'Your order ABCDEFGHJK for Convention A is paid',
  body: BODY,
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/emails/email-1']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/emails/:emailId"
              element={<EmailPage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

/** A section of the page by its heading, once the email is read. */
const section = async (name: string | RegExp) =>
  within((await screen.findByRole('heading', { name })).closest('section')!)
/** What the page tells of the email, each under its name. */
const facts = (scope: { getAllByRole: (role: string) => HTMLElement[] }) =>
  Object.fromEntries(
    scope
      .getAllByRole('term')
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
  )

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  state.tickets = 'read'
  readEmail.mockResolvedValue(email())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the page of an email', () => {
  it('shows nothing of the email to a member without tickets access', async () => {
    state.tickets = 'none'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readEmail).not.toHaveBeenCalled()
  })

  it('tells what the email is, to whom it went, of which order and when', async () => {
    view()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Confirmation with the QR code' }),
    ).toBeDefined()
    expect(readEmail).toHaveBeenCalledWith({ editionId: 'edition-2026', emailId: 'email-1' })
    expect(screen.getByRole('link', { name: 'All emails' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/emails',
    )
    const about = await section('Email')
    expect(facts(about)).toEqual({
      To: 'buyer@example.test',
      Order: 'ABCDEFGHJK',
      Queued: 'at 2026-05-01T10:05:01.000Z',
      Sent: 'at 2026-05-01T10:05:10.000Z',
    })
    expect(about.getByRole('link', { name: 'ABCDEFGHJK' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/orders/order-1',
    )
  })

  it('shows what the email said, its lines as they went out, and says what is left out', async () => {
    view()
    const said = await section('What it said')

    expect(facts(said)).toEqual({ Subject: 'Your order ABCDEFGHJK for Convention A is paid' })
    const text = said.getByText(/^Thank you\./)
    expect(text.textContent).toBe(BODY)
    // Its lines are kept: the text is shown as written.
    expect(text.className).toContain('whitespace-pre-wrap')
    expect(
      said.getByText(/The QR code and the order link are left out: only the recipient sees them/),
    ).toBeDefined()
  })

  it('says nothing is left out of an email that hands nothing over', async () => {
    readEmail.mockResolvedValue(
      email({
        kind: 'order-expired',
        subject: 'Your order ABCDEFGHJK for Convention A has expired',
        body: 'Nothing was charged.\n\nOPOS',
      }),
    )
    view()
    const said = await section('What it said')

    expect(said.getByText(/^Nothing was charged\./)).toBeDefined()
    expect(said.queryByText(/left out/)).toBeNull()
  })

  it('names an alert to the orgs without their addresses', async () => {
    readEmail.mockResolvedValue(email({ kind: 'needs-review', recipient: null }))
    view()

    expect(facts(await section('Email')).To).toBe('The organizers')
  })

  it('says why an email that has not gone out says nothing yet', async () => {
    readEmail.mockResolvedValue(
      email({ sentAt: null, failedAttempts: 2, subject: null, body: null }),
    )
    view()

    expect(facts(await section('Email')).Sent).toBe('Not sent yet: it is tried again')
    const said = await section('What it said')
    expect(
      said.getByText('An email is written when it is sent: this one has not gone out.'),
    ).toBeDefined()
    expect(said.queryByRole('term')).toBeNull()
  })

  it('says of an email sent before texts were kept that what it said is not kept', async () => {
    readEmail.mockResolvedValue(email({ subject: null, body: null }))
    view()

    const said = await section('What it said')
    expect(
      said.getByText('What this email said was not kept: it went out before texts were.'),
    ).toBeDefined()
  })

  it('says an unknown email is not there', async () => {
    readEmail.mockRejectedValue(new ORPCError('request.not-found', { status: 404 }))
    view()

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeDefined()
  })
})
