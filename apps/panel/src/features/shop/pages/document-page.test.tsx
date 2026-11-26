import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as FileUpload from '../../../shared/lib/file-upload'
import { DocumentPage } from './document-page'

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
// What a test holds the reading of a chosen file by, to act while it lasts.
const reading = vi.hoisted(() => ({ held: Promise.resolve() }))

vi.mock('../../../shared/lib/notify', () => ({ notifyFailure }))
vi.mock('../../../shared/lib/file-upload', async (original) => {
  const actual = await original<typeof FileUpload>()
  return {
    toUpload: async (file: File) => {
      await reading.held
      return actual.toUpload(file)
    },
  }
})
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

const view = (id = TERMS) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/convention-a/editions/2026/documents/${id}`]}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/documents/:documentId"
              element={<DocumentPage />}
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
  reading.held = Promise.resolve()
})

afterEach(cleanup)

describe('the page of a document', () => {
  it('is closed to a member without the tickets of the edition, and asks the API nothing', () => {
    view()

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(readDocuments).not.toHaveBeenCalled()
  })

  it('names itself after the document and links back to the documents and consents', async () => {
    state.tickets = 'read'
    view()

    expect(await screen.findByRole('heading', { name: 'Shop terms', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Documents and consents' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/documents',
    )
  })

  it('lists the versions of the document with where anyone reads each, for a reader too', async () => {
    state.tickets = 'read'
    view()

    const versions = within(await screen.findByRole('table', { name: 'Versions of the document' }))
    expect(versions.getByRole('link', { name: 'Version 1' }).getAttribute('href')).toMatch(
      new RegExp(`/public/tenants/convention-a/document-versions/${VERSION}$`),
    )
    expect(versions.getByText('at 2027-05-01T08:00:00.000Z')).toBeDefined()
    expect(versions.getByText(/terms\.pdf/)).toBeDefined()
    // A reader changes nothing of it.
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText('Title')).toBeNull()
  })

  it('says so while no version is published, and when the edition holds no such document', async () => {
    state.tickets = 'read'
    view(RULES)
    expect(await screen.findByText('No version is published yet.')).toBeDefined()
    cleanup()

    view('0e0d8f7e-0000-4b5e-9f60-000000000000')
    expect(await screen.findByRole('heading', { name: /not found/i })).toBeDefined()
  })

  it('renames the document', async () => {
    state.tickets = 'write'
    view()

    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Terms of the shop' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save the title' }))

    await vi.waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(1))
    expect(updateDocument.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', documentId: TERMS },
      body: { title: 'Terms of the shop' },
    })
  })

  it('publishes the chosen PDF as the next version of its document', async () => {
    state.tickets = 'write'
    view()
    const publish = await screen.findByRole('button', { name: 'Publish the version' })
    expect(publish.hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText('New version'), { target: { files: [pdf()] } })
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

  it('leaves a title typed and not saved when a version is published', async () => {
    state.tickets = 'write'
    view()
    const title = await screen.findByLabelText<HTMLInputElement>('Title')
    fireEvent.change(title, { target: { value: 'Terms of the shop' } })
    readDocuments.mockResolvedValue([
      {
        ...terms,
        versions: [
          ...terms.versions,
          {
            id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
            number: 2,
            publishedAt: '2027-05-02T08:00:00.000Z',
            file: { name: 'terms-v2.pdf', size: 5 },
          },
        ],
      },
      rules,
    ])

    fireEvent.change(screen.getByLabelText('New version'), { target: { files: [pdf()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish the version' }))

    expect(await screen.findByRole('link', { name: 'Version 2' })).toBeDefined()
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('Terms of the shop')
  })

  // A published version is never removed: a second press while the file is read publishes none.
  it('publishes a version once, however often the button is pressed while its file is read', async () => {
    state.tickets = 'write'
    let release = () => {}
    reading.held = new Promise((resolve) => {
      release = resolve
    })
    view()
    const publish = await screen.findByRole('button', { name: 'Publish the version' })
    fireEvent.change(screen.getByLabelText('New version'), { target: { files: [pdf()] } })

    fireEvent.click(publish)
    fireEvent.click(publish)
    expect(publish.hasAttribute('disabled')).toBe(true)
    release()

    await vi.waitFor(() => expect(publishVersion).toHaveBeenCalled())
    // The field is emptied once the version is published: every reading is over by then.
    await vi.waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('New version').files).toHaveLength(0),
    )
    expect(publishVersion).toHaveBeenCalledTimes(1)
  })

  it('refuses a file that is no PDF beside its field, and sends nothing', async () => {
    state.tickets = 'write'
    view()

    fireEvent.change(await screen.findByLabelText('New version'), {
      target: { files: [pdf('image/png', 'terms.png')] },
    })

    expect(screen.getByText('Choose a PDF file.')).toBeDefined()
    expect(
      screen.getByRole('button', { name: 'Publish the version' }).hasAttribute('disabled'),
    ).toBe(true)
    expect(publishVersion).not.toHaveBeenCalled()
  })

  it('deletes a document once its modal is confirmed', async () => {
    state.tickets = 'write'
    view(RULES)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete the document' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete the document “House rules”?' })
    expect(dialog.textContent).toContain('This action cannot be undone.')
    expect(removeDocument).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the document' }))

    await vi.waitFor(() => expect(removeDocument).toHaveBeenCalledTimes(1))
    expect(removeDocument.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-2026', documentId: RULES },
    })
    // Nothing is left to show of it: the member is led back to the documents.
    expect(await screen.findByText('the documents and consents')).toBeDefined()
  })
})
