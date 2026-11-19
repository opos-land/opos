import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  type Consent,
  DOCUMENT_KINDS,
  type DocumentKind,
  type EditionDocument,
} from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  FormField,
  Input,
  LoadingView,
  NativeSelect,
  NativeSelectOption,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import {
  consentsOptions,
  createConsentOptions,
  createDocumentOptions,
  documentsOptions,
  shopKey,
} from '../api/shop'
import { ConsentForm } from '../components/consent-form'
import { ConsentRow } from '../components/consent-row'
import { DocumentCard } from '../components/document-card'
import { KIND_LABELS } from '../model/documents'

const NEW_CONSENT = { text: '', isRequired: true, documentId: null }

/**
 * The legal documents and the consents of an edition (`/editions/:editionSlug/documents`). Their
 * kind and wording are the convention's: OPOS ships no text of its own. Reading needs
 * tickets>=read in the edition, changing tickets=write.
 */
export function EditionDocumentsPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Documents and consents`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const documents = useQuery({ ...documentsOptions(api, edition?.id ?? ''), enabled: canRead })
  const consents = useQuery({ ...consentsOptions(api, edition?.id ?? ''), enabled: canRead })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  return (
    <>
      <PageHeader title={<Trans>Documents and consents</Trans>} description={edition.name} />
      <Section title={<Trans>Documents</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            The legal documents of this edition, each published as a PDF. The shop links the newest
            version of a document, and an order keeps the version its buyer accepted. Opening the
            shop needs the shop terms and the privacy policy.
          </Trans>
        </p>
        {documents.isPending ? (
          <LoadingView />
        ) : documents.isError ? (
          <ErrorMessage error={documents.error} />
        ) : documents.data.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no documents yet.</Trans>
          </p>
        ) : (
          documents.data.map((document) => (
            <DocumentCard key={document.id} document={document} canWrite={canWrite} />
          ))
        )}
        {canWrite && <NewDocument editionId={edition.id} />}
      </Section>
      <Section title={<Trans>Consents</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            What a buyer accepts at the checkout, in the order below. The wording is yours, and so
            is the choice of which consent is required.
          </Trans>
        </p>
        {consents.isPending || documents.isPending ? (
          <LoadingView />
        ) : consents.isError ? (
          <ErrorMessage error={consents.error} />
        ) : (
          <ConsentList
            editionId={edition.id}
            consents={consents.data}
            documents={documents.data ?? []}
            canWrite={canWrite}
          />
        )}
      </Section>
    </>
  )
}

function NewDocument({ editionId }: { editionId: string }) {
  const { t, i18n } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<DocumentKind>('shop-terms')
  const [title, setTitle] = useState('')
  const create = useMutation({
    ...createDocumentOptions(api),
    meta: { success: msg`The document is added. Publish its first version.` },
    onSuccess: async () => {
      setTitle('')
      await queryClient.invalidateQueries({ queryKey: shopKey(api) })
    },
  })
  const trimmed = title.trim()

  return (
    <form
      noValidate
      className="flex max-w-lg flex-col gap-4 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (trimmed) create.mutate({ params: { editionId }, body: { kind, title: trimmed } })
      }}
    >
      <h3 className="text-sm font-medium">
        <Trans>New document</Trans>
      </h3>
      <FormField label={t`Kind`}>
        {(control) => (
          <NativeSelect
            {...control}
            value={kind}
            onChange={(event) => setKind(event.target.value as DocumentKind)}
          >
            {DOCUMENT_KINDS.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {i18n._(KIND_LABELS[option])}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField label={t`Title of the new document`}>
        {(control) => (
          <Input
            {...control}
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
        )}
      </FormField>
      <div>
        <Button type="submit" disabled={!trimmed || create.isPending}>
          <Trans>Add the document</Trans>
        </Button>
      </div>
    </form>
  )
}

function ConsentList({
  editionId,
  consents,
  documents,
  canWrite,
}: {
  editionId: string
  consents: Consent[]
  documents: EditionDocument[]
  canWrite: boolean
}) {
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const listId = useId()
  // A new key empties the form once its consent is added.
  const [form, setForm] = useState(0)
  const create = useMutation({
    ...createConsentOptions(api),
    meta: { success: msg`The consent is added.` },
    onSuccess: async () => {
      setForm((key) => key + 1)
      await queryClient.invalidateQueries({ queryKey: shopKey(api) })
    },
  })

  return (
    <>
      {consents.length === 0 ? (
        <p className="text-sm">
          <Trans>The edition has no consents yet.</Trans>
        </p>
      ) : (
        <>
          <h3 id={listId} className="sr-only">
            <Trans>Consents in their order</Trans>
          </h3>
          <ol aria-labelledby={listId} className="flex flex-col gap-3">
            {consents.map((consent, index) => (
              <ConsentRow
                key={consent.id}
                consent={consent}
                documents={documents}
                last={index === consents.length - 1}
                canWrite={canWrite}
              />
            ))}
          </ol>
        </>
      )}
      {canWrite && (
        <div className="flex flex-col gap-4 border-t pt-4">
          <h3 className="text-sm font-medium">
            <Trans>New consent</Trans>
          </h3>
          <ConsentForm
            key={form}
            initial={NEW_CONSENT}
            documents={documents}
            pending={create.isPending}
            submitLabel={<Trans>Add the consent</Trans>}
            onSubmit={(body) => create.mutate({ params: { editionId }, body })}
          />
        </div>
      )}
    </>
  )
}
