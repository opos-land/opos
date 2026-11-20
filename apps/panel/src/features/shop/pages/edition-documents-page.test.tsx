import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionDocumentsPage } from './edition-documents-page'

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
  ...fields,
})

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2026/documents']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/documents"
              element={<EditionDocumentsPage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

/** The row of a table that holds the text. */
const row = (text: string) => within(screen.getByText(text).closest('tr')!)
const cells = (text: string) =>
  [...screen.getByText(text).closest('tr')!.querySelectorAll('td')].map((cell) => cell.textContent)

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

describe('EditionDocumentsPage', () => {
  it('is closed to a member without the tickets of the edition, and asks the API nothing', () => {
    view()

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readDocuments).not.toHaveBeenCalled()
    expect(readConsents).not.toHaveBeenCalled()
  })

  it('names itself, and lists the documents in a table with their kind and their newest version', async () => {
    state.tickets = 'read'
    view()

    await screen.findByRole('table', { name: 'Documents by their title' })
    expect(screen.getByRole('heading', { name: 'Documents and consents', level: 1 })).toBeDefined()
    expect(document.title).toBe('Documents and consents · Edition 2026 · OPOS panel')
    expect(cells('House rules')).toEqual([
      'House rulesHidden from the shop',
      'Edition rules',
      'No version is published yet.',
    ])
    const shown = row('Version 1')
    expect(shown.getByRole('link', { name: 'Shop terms' })).toBeDefined()
    // Anyone reads the newest version straight from the list.
    expect(shown.getByRole('link', { name: 'Version 1' }).getAttribute('href')).toMatch(
      new RegExp(`/public/tenants/convention-a/document-versions/${VERSION}$`),
    )
    expect(shown.getByText(/at 2027-05-01T08:00:00.000Z/)).toBeDefined()
  })

  it('opens the page of a document from its row, for a reader too: its versions are read there', async () => {
    state.tickets = 'read'
    view()

    const link = await screen.findByRole('link', { name: 'Shop terms' })
    expect(link.getAttribute('href')).toBe(`/convention-a/editions/2026/documents/${TERMS}`)
  })

  it('shows a member who reads the tickets nothing to change', async () => {
    state.tickets = 'read'
    view()
    await screen.findByText('Consent 1')

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link', { name: 'New document' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'New consent' })).toBeNull()
    // A consent has a page only to be changed on: a reader has none to open.
    expect(screen.queryByRole('link', { name: 'Consent 1' })).toBeNull()
  })

  it('hides a document that is shown and shows one that is hidden, in the list itself', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('House rules')

    fireEvent.click(row('Version 1').getByRole('button', { name: 'Hide from the shop' }))
    fireEvent.click(row('House rules').getByRole('button', { name: 'Show in the shop' }))

    await vi.waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(2))
    expect(updateDocument.mock.calls.map(([call]) => call as object)).toEqual([
      { params: { editionId: 'edition-2026', documentId: TERMS }, body: { hidden: true } },
      { params: { editionId: 'edition-2026', documentId: RULES }, body: { hidden: false } },
    ])
    // Its title, a new version and its deletion are on the page of the document.
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete the document' })).toBeNull()
  })

  it('lists the consents in a table in their order, each with what it asks and the document it links', async () => {
    state.tickets = 'read'
    view()
    await screen.findByRole('table', { name: 'Consents in their order' })

    expect(cells('Consent 1')).toEqual(['Consent 1', 'Required', 'Shop terms'])
    expect(cells('Consent 2')).toEqual(['Consent 2', 'Optional', '—'])
  })

  it('opens the page of a consent from its row, for a member who may change it', async () => {
    state.tickets = 'write'
    view()

    const link = await screen.findByRole('link', { name: 'Consent 1' })
    expect(link.getAttribute('href')).toBe(
      '/convention-a/editions/2026/documents/consents/consent-1',
    )
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete the consent' })).toBeNull()
  })

  it('moves a consent up and down the list, the first only down and the last only up', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('Consent 1')

    expect(row('Consent 1').queryByRole('button', { name: 'Move up' })).toBeNull()
    expect(row('Consent 2').queryByRole('button', { name: 'Move down' })).toBeNull()
    fireEvent.click(row('Consent 1').getByRole('button', { name: 'Move down' }))

    await vi.waitFor(() => expect(updateConsent).toHaveBeenCalledTimes(1))
    expect(updateConsent.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', consentId: 'consent-1' },
      body: { position: 2 },
    })
  })

  it('hides a consent in the list itself', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('Consent 1')

    fireEvent.click(row('Consent 1').getByRole('button', { name: 'Hide from the shop' }))

    await vi.waitFor(() => expect(updateConsent).toHaveBeenCalledTimes(1))
    expect(updateConsent.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', consentId: 'consent-1' },
      body: { hidden: true },
    })
  })

  it('links a member who may add to the pages of a new document and a new consent, and holds no form of either', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('Consent 1')

    expect(screen.getByRole('link', { name: 'New document' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/documents/new',
    )
    expect(screen.getByRole('link', { name: 'New consent' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/documents/consents/new',
    )
    expect(screen.queryByLabelText('Title of the new document')).toBeNull()
    expect(screen.queryByLabelText('Sentence the buyer accepts')).toBeNull()
  })

  it('says so when the edition has no document and no consent yet', async () => {
    state.tickets = 'read'
    readDocuments.mockResolvedValue([])
    readConsents.mockResolvedValue([])
    view()

    expect(await screen.findByText('The edition has no documents yet.')).toBeDefined()
    expect(await screen.findByText('The edition has no consents yet.')).toBeDefined()
  })
})
