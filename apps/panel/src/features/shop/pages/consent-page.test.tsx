import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsentPage } from './consent-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readDocuments = vi.hoisted(() => vi.fn())
const createDocument = vi.hoisted(() => vi.fn())
const updateDocument = vi.hoisted(() => vi.fn())
const publishVersion = vi.hoisted(() => vi.fn())
const removeDocument = vi.hoisted(() => vi.fn())
const readConsents = vi.hoisted(() => vi.fn())
const createConsent = vi.hoisted(() => vi.fn())
const updateConsent = vi.hoisted(() => vi.fn())
const removeConsent = vi.hoisted(() => vi.fn())
const notifyFailure = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/lib/notify', () => ({ notifyFailure }))
vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
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
vi.mock('../api/shop', () => ({
  documentsOptions: () => ({ queryKey: ['shop', 'documents'], queryFn: readDocuments }),
  createDocumentOptions: () => ({ mutationFn: createDocument }),
  updateDocumentOptions: () => ({ mutationFn: updateDocument }),
  publishVersionOptions: () => ({ mutationFn: publishVersion }),
  removeDocumentOptions: () => ({ mutationFn: removeDocument }),
  consentsOptions: () => ({ queryKey: ['shop', 'consents'], queryFn: readConsents }),
  createConsentOptions: () => ({ mutationFn: createConsent }),
  updateConsentOptions: () => ({ mutationFn: updateConsent }),
  removeConsentOptions: () => ({ mutationFn: removeConsent }),
  shopKey: () => ['shop'],
}))

const TERMS = '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60'
const RULES = '7c1f6c0e-5d1b-4a0e-8f43-2d1e9b7a6c55'
const VERSION = '3b2a1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d'

const terms = {
  id: TERMS,
  editionId: 'edition-2026',
  kind: 'shop-terms',
  title: 'Shop terms',
  hidden: false,
  versions: [
    {
      id: VERSION,
      number: 1,
      publishedAt: '2027-05-01T08:00:00.000Z',
      file: { name: 'terms.pdf', size: 2048 },
    },
  ],
}
const rules = {
  id: RULES,
  editionId: 'edition-2026',
  kind: 'edition-rules',
  title: 'House rules',
  hidden: true,
  versions: [],
}
const consent = (position: number, fields: object = {}) => ({
  id: `consent-${position}`,
  editionId: 'edition-2026',
  documentId: null,
  text: `Consent ${position}`,
  isRequired: true,
  position,
  hidden: false,
  accepted: false,
  ...fields,
})

const view = (id = 'consent-1') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/convention-a/editions/2026/documents/consents/${id}`]}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/documents/consents/:consentId"
              element={<ConsentPage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/documents"
              element={<p>the documents and consents</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.tickets = 'none'
  readDocuments.mockReset().mockResolvedValue([terms, rules])
  readConsents
    .mockReset()
    .mockResolvedValue([consent(1, { documentId: TERMS }), consent(2, { isRequired: false })])
  for (const write of [
    createDocument,
    updateDocument,
    publishVersion,
    removeDocument,
    createConsent,
    updateConsent,
    removeConsent,
  ]) {
    write.mockReset().mockResolvedValue(undefined)
  }
  notifyFailure.mockReset()
})

afterEach(cleanup)

describe('the page of a consent', () => {
  it('is closed to a member who only reads the tickets of the edition', async () => {
    state.tickets = 'read'
    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByLabelText('Sentence the buyer accepts')).toBeNull()
  })

  it('names itself and links back to the documents and consents', async () => {
    state.tickets = 'write'
    view()

    expect(await screen.findByRole('heading', { name: 'Consent', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Documents and consents' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/documents',
    )
  })

  it('says so when the edition holds no such consent', async () => {
    state.tickets = 'write'
    view('consent-9')

    expect(await screen.findByRole('heading', { name: /not found/i })).toBeDefined()
  })

  it('changes the consent: its sentence and whether it is required, never its document', async () => {
    state.tickets = 'write'
    view()

    const sentence = await screen.findByLabelText<HTMLTextAreaElement>('Sentence the buyer accepts')
    expect(sentence.value).toBe('Consent 1')
    // No order accepted it: its sentence is the org's to change.
    expect(sentence.readOnly).toBe(false)
    expect(screen.queryByText(/An order has already accepted this consent/)).toBeNull()
    // The document is linked for good: another link is a new consent.
    expect(screen.queryByLabelText('Linked document')).toBeNull()
    expect(
      screen.getByText(
        'A consent links its document for good. To link another one, add a new consent.',
      ),
    ).toBeDefined()
    fireEvent.change(sentence, { target: { value: 'I accept the terms of the shop.' } })
    fireEvent.change(screen.getByLabelText('Acceptance'), { target: { value: 'optional' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the consent' }))

    await vi.waitFor(() => expect(updateConsent).toHaveBeenCalledTimes(1))
    expect(updateConsent.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', consentId: 'consent-1' },
      body: { text: 'I accept the terms of the shop.', isRequired: false },
    })
  })

  // An order shows the sentence its buyer accepted: the page says so before the org tries, and
  // sends no sentence with the rest.
  it('says that the sentence of a consent an order accepted stays, and saves the rest', async () => {
    state.tickets = 'write'
    readConsents.mockResolvedValue([consent(1, { accepted: true })])
    view()

    const sentence = await screen.findByLabelText<HTMLTextAreaElement>('Sentence the buyer accepts')
    expect(sentence.value).toBe('Consent 1')
    expect(sentence.readOnly).toBe(true)
    expect(
      screen.getByText(
        'An order has already accepted this consent, so its sentence cannot be changed. To ask for another sentence, hide this consent in the list of consents and add a new one.',
      ),
    ).toBeDefined()
    fireEvent.change(screen.getByLabelText('Acceptance'), { target: { value: 'optional' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the consent' }))

    await vi.waitFor(() => expect(updateConsent).toHaveBeenCalledTimes(1))
    expect(updateConsent.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', consentId: 'consent-1' },
      body: { isRequired: false },
    })
  })

  it('deletes the consent once its modal is confirmed', async () => {
    state.tickets = 'write'
    view('consent-2')

    fireEvent.click(await screen.findByRole('button', { name: 'Delete the consent' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this consent?' })
    expect(dialog.textContent).toContain('“Consent 2”. This action cannot be undone.')
    expect(removeConsent).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the consent' }))

    await vi.waitFor(() => expect(removeConsent).toHaveBeenCalledTimes(1))
    expect(removeConsent.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', consentId: 'consent-2' },
    })
    // Nothing is left to show of it: the member is led back to the consents.
    expect(await screen.findByText('the documents and consents')).toBeDefined()
  })
})
