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

const document_ = (title: string) => within(screen.getByRole('article', { name: title }))
const consents = () => within(screen.getByRole('list', { name: 'Consents in their order' }))
const pdf = (type = 'application/pdf', name = 'terms-v2.pdf') =>
  new File([new Uint8Array(5)], name, { type })

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

  it('names itself, and lists the documents with their kind, their versions and where to read them', async () => {
    state.tickets = 'read'
    view()

    const shown = within(await screen.findByRole('article', { name: 'Shop terms' }))
    expect(screen.getByRole('heading', { name: 'Documents and consents', level: 1 })).toBeDefined()
    expect(document.title).toBe('Documents and consents · Edition 2026 · OPOS panel')
    expect(shown.getByText('Shop terms', { selector: '[data-slot=badge]' })).toBeDefined()
    const link = shown.getByRole('link', { name: 'Version 1' })
    expect(link.getAttribute('href')).toMatch(
      new RegExp(`/public/tenants/convention-a/document-versions/${VERSION}$`),
    )
    expect(shown.getByText(/at 2027-05-01T08:00:00.000Z/)).toBeDefined()
    expect(shown.getByText(/terms\.pdf/)).toBeDefined()

    const hidden = document_('House rules')
    expect(hidden.getByText('Hidden from the shop')).toBeDefined()
    expect(hidden.getByText('No version is published yet.')).toBeDefined()
  })

  it('shows a member who reads the tickets nothing to change', async () => {
    state.tickets = 'read'
    view()
    await screen.findByRole('article', { name: 'Shop terms' })
    await screen.findByText('Consent 1')

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText('Title of the new document')).toBeNull()
    expect(screen.queryByLabelText('Sentence the buyer accepts')).toBeNull()
  })

  it('names the forms that add a document and a consent, for a member who may add them', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('Consent 1')

    expect(screen.getByRole('heading', { name: 'New document', level: 3 })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'New consent', level: 3 })).toBeDefined()
    cleanup()

    state.tickets = 'read'
    view()
    await screen.findByText('Consent 1')
    expect(screen.queryByRole('heading', { name: 'New document' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'New consent' })).toBeNull()
  })

  it('adds a document with its kind and title', async () => {
    state.tickets = 'write'
    view()
    await screen.findByRole('article', { name: 'Shop terms' })

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'privacy-policy' } })
    fireEvent.change(screen.getByLabelText('Title of the new document'), {
      target: { value: ' Privacy policy ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add the document' }))

    await vi.waitFor(() => expect(createDocument).toHaveBeenCalledTimes(1))
    expect(createDocument.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026' },
      body: { kind: 'privacy-policy', title: 'Privacy policy' },
    })
    await vi.waitFor(() => expect(readDocuments).toHaveBeenCalledTimes(2))
  })

  it('publishes the chosen PDF as the next version of its document', async () => {
    state.tickets = 'write'
    view()
    await screen.findByRole('article', { name: 'Shop terms' })
    const shown = document_('Shop terms')
    const publish = shown.getByRole('button', { name: 'Publish the version' })
    expect(publish.hasAttribute('disabled')).toBe(true)

    fireEvent.change(shown.getByLabelText('New version'), { target: { files: [pdf()] } })
    fireEvent.click(publish)

    await vi.waitFor(() => expect(publishVersion).toHaveBeenCalledTimes(1))
    expect(publishVersion.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', documentId: TERMS },
      body: {
        file: {
          name: 'terms-v2.pdf',
          type: 'application/pdf',
          data: Buffer.from(new Uint8Array(5)).toString('base64'),
        },
      },
    })
  })

  it('refuses a file that is no PDF beside its field, and sends nothing', async () => {
    state.tickets = 'write'
    view()
    await screen.findByRole('article', { name: 'Shop terms' })
    const shown = document_('Shop terms')

    fireEvent.change(shown.getByLabelText('New version'), {
      target: { files: [pdf('image/png', 'terms.png')] },
    })

    expect(shown.getByText('Choose a PDF file.')).toBeDefined()
    expect(
      shown.getByRole('button', { name: 'Publish the version' }).hasAttribute('disabled'),
    ).toBe(true)
    expect(publishVersion).not.toHaveBeenCalled()
  })

  it('renames a document, hides one that is shown and shows one that is hidden', async () => {
    state.tickets = 'write'
    view()
    await screen.findByRole('article', { name: 'Shop terms' })

    const shown = document_('Shop terms')
    fireEvent.change(shown.getByLabelText('Title'), { target: { value: 'Terms of the shop' } })
    fireEvent.click(shown.getByRole('button', { name: 'Save the title' }))
    await vi.waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(1))
    expect(updateDocument.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', documentId: TERMS },
      body: { title: 'Terms of the shop' },
    })

    fireEvent.click(shown.getByRole('button', { name: 'Hide from the shop' }))
    await vi.waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(2))
    expect(updateDocument.mock.calls[1]?.[0]).toMatchObject({ body: { hidden: true } })

    fireEvent.click(document_('House rules').getByRole('button', { name: 'Show in the shop' }))
    await vi.waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(3))
    expect(updateDocument.mock.calls[2]?.[0]).toEqual({
      params: { editionId: 'edition-2026', documentId: RULES },
      body: { hidden: false },
    })
  })

  it('deletes a document once its modal is confirmed', async () => {
    state.tickets = 'write'
    view()
    await screen.findByRole('article', { name: 'House rules' })

    fireEvent.click(document_('House rules').getByRole('button', { name: 'Delete the document' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete the document House rules?' })
    expect(dialog.textContent).toContain('This action cannot be undone.')
    expect(removeDocument).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the document' }))

    await vi.waitFor(() => expect(removeDocument).toHaveBeenCalledTimes(1))
    expect(removeDocument.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', documentId: RULES },
    })
  })

  it('lists the consents in their order, each with what it asks and the document it links', async () => {
    state.tickets = 'read'
    view()
    await screen.findByText('Consent 1')

    const rows = consents().getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByText(/^Consent \d$/).textContent)).toEqual([
      'Consent 1',
      'Consent 2',
    ])
    expect(within(rows[0]!).getByText('Required')).toBeDefined()
    expect(within(rows[0]!).getByText('Links the document: Shop terms')).toBeDefined()
    expect(within(rows[1]!).getByText('Optional')).toBeDefined()
  })

  it('adds a consent with its sentence, whether it is required and its document', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('Consent 1')

    fireEvent.change(screen.getByLabelText('Sentence the buyer accepts'), {
      target: { value: ' I accept the shop terms. ' },
    })
    fireEvent.change(screen.getByLabelText('The buyer'), { target: { value: 'optional' } })
    fireEvent.change(screen.getByLabelText('Linked document'), { target: { value: TERMS } })
    fireEvent.click(screen.getByRole('button', { name: 'Add the consent' }))

    await vi.waitFor(() => expect(createConsent).toHaveBeenCalledTimes(1))
    expect(createConsent.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026' },
      body: { text: 'I accept the shop terms.', isRequired: false, documentId: TERMS },
    })
  })

  it('moves a consent up and down the list, the first only down and the last only up', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('Consent 1')
    const [first, second] = consents().getAllByRole('listitem')

    expect(within(first!).queryByRole('button', { name: 'Move up' })).toBeNull()
    expect(within(second!).queryByRole('button', { name: 'Move down' })).toBeNull()
    fireEvent.click(within(first!).getByRole('button', { name: 'Move down' }))

    await vi.waitFor(() => expect(updateConsent).toHaveBeenCalledTimes(1))
    expect(updateConsent.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', consentId: 'consent-1' },
      body: { position: 2 },
    })
  })

  it('changes a consent in place: its sentence, whether it is required and its document', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('Consent 1')
    const [first] = consents().getAllByRole('listitem')

    fireEvent.click(within(first!).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(first!).getByLabelText('Sentence the buyer accepts'), {
      target: { value: 'I accept the terms of the shop.' },
    })
    fireEvent.change(within(first!).getByLabelText('The buyer'), { target: { value: 'optional' } })
    fireEvent.change(within(first!).getByLabelText('Linked document'), { target: { value: '' } })
    fireEvent.click(within(first!).getByRole('button', { name: 'Save the consent' }))

    await vi.waitFor(() => expect(updateConsent).toHaveBeenCalledTimes(1))
    expect(updateConsent.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', consentId: 'consent-1' },
      body: { text: 'I accept the terms of the shop.', isRequired: false, documentId: null },
    })
  })

  it('hides a consent, and deletes one once its modal is confirmed', async () => {
    state.tickets = 'write'
    view()
    await screen.findByText('Consent 1')
    const [first, second] = consents().getAllByRole('listitem')

    fireEvent.click(within(first!).getByRole('button', { name: 'Hide from the shop' }))
    await vi.waitFor(() => expect(updateConsent).toHaveBeenCalledTimes(1))
    expect(updateConsent.mock.calls[0]?.[0]).toMatchObject({ body: { hidden: true } })

    fireEvent.click(within(second!).getByRole('button', { name: 'Delete the consent' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this consent?' })
    expect(dialog.textContent).toContain('Consent 2')
    expect(dialog.textContent).toContain('This action cannot be undone.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the consent' }))

    await vi.waitFor(() => expect(removeConsent).toHaveBeenCalledTimes(1))
    expect(removeConsent.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', consentId: 'consent-2' },
    })
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
