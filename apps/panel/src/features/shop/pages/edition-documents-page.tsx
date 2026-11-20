import { Trans, useLingui } from '@lingui/react/macro'
import { type Consent, type EditionDocument } from '@opos/contract'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { Link, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  buttonVariants,
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import { consentsOptions, documentsOptions } from '../api/shop'
import { ConsentRow } from '../components/consent-row'
import { DocumentCard } from '../components/document-card'

/**
 * The legal documents and the consents of an edition (`/editions/:editionSlug/documents`). Their
 * kind and wording are the convention's: OPOS ships no text of its own. A member who may add is
 * linked to the page of a new document and to the page of a new consent. Reading needs
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
  const base = `/${tenant.slug}/editions/${edition.slug}/documents`
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
        {canWrite && (
          <AddLink to={`${base}/new`}>
            <Trans>New document</Trans>
          </AddLink>
        )}
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
            consents={consents.data}
            documents={documents.data ?? []}
            canWrite={canWrite}
          />
        )}
        {canWrite && (
          <AddLink to={`${base}/consents/new`}>
            <Trans>New consent</Trans>
          </AddLink>
        )}
      </Section>
    </>
  )
}

/** The link to the page that adds what the section lists. */
function AddLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <div>
      <Link to={to} className={buttonVariants({ variant: 'outline' })}>
        <PlusIcon data-icon="inline-start" />
        {children}
      </Link>
    </div>
  )
}

function ConsentList({
  consents,
  documents,
  canWrite,
}: {
  consents: Consent[]
  documents: EditionDocument[]
  canWrite: boolean
}) {
  const listId = useId()

  return consents.length === 0 ? (
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
  )
}
