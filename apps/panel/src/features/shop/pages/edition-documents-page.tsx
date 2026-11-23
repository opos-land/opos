import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type Consent, type EditionDocument } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { env } from '../../../shared/config/env'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  Button,
  buttonVariants,
  ErrorMessage,
  LinkRow,
  LoadingView,
  NoPermissionView,
  PageHeader,
  RowLink,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import {
  consentsOptions,
  documentsOptions,
  shopKey,
  updateConsentOptions,
  updateDocumentOptions,
} from '../api/shop'
import { KIND_LABELS, versionUrl } from '../model/documents'

/**
 * The legal documents and the consents of an edition (`/editions/:editionSlug/documents`), each
 * as a table. Their kind and wording are the convention's: OPOS ships no text of its own. A row
 * opens the page of its document or consent; a member who may change them hides a row here, moves
 * a consent, and is linked to the page of a new document and to the page of a new consent. Reading
 * needs tickets>=read in the edition, changing tickets=write.
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
          <Table>
            <caption className="sr-only">
              <Trans>Documents by their title</Trans>
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans context="a document">Title</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans context="a document">Kind</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Newest version</Trans>
                </TableHead>
                {canWrite && (
                  <TableHead scope="col">
                    <Trans>Actions</Trans>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.data.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  to={`${base}/${document.id}`}
                  canWrite={canWrite}
                />
              ))}
            </TableBody>
          </Table>
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
        ) : consents.data.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no consents yet.</Trans>
          </p>
        ) : (
          <Table>
            <caption className="sr-only">
              <Trans>Consents in their order</Trans>
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans context="a consent">Sentence</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans context="a consent">Acceptance</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans context="a consent">Linked document</Trans>
                </TableHead>
                {canWrite && (
                  <TableHead scope="col">
                    <Trans>Actions</Trans>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {consents.data.map((consent, index) => (
                <ConsentRow
                  key={consent.id}
                  consent={consent}
                  linked={documents.data?.find((document) => document.id === consent.documentId)}
                  // The page of a consent is where it is changed: a reader has none to open.
                  to={canWrite ? `${base}/consents/${consent.id}` : undefined}
                  last={index === consents.data.length - 1}
                />
              ))}
            </TableBody>
          </Table>
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

/**
 * One document in the table: its title, its kind and its newest version, which anyone reads from
 * here; hiding it asks nothing, since the same button shows it again.
 */
function DocumentRow({
  document,
  to,
  canWrite,
}: {
  document: EditionDocument
  to: string
  canWrite: boolean
}) {
  const { i18n } = useLingui()
  const { tenant, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const newest = document.versions.reduce<EditionDocument['versions'][number] | undefined>(
    (held, version) => (held && held.number > version.number ? held : version),
    undefined,
  )
  const number = newest?.number ?? 0
  const update = useMutation({
    ...updateDocumentOptions(api),
    meta: { success: msg`The document is saved.` },
    // The shop of the edition reads which documents it shows.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shopKey(api) }),
  })

  return (
    <LinkRow to={to}>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <RowLink to={to}>{document.title}</RowLink>
          {document.hidden && (
            <Badge variant="outline">
              <Trans context="a document">Hidden from the shop</Trans>
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>{i18n._(KIND_LABELS[document.kind])}</TableCell>
      <TableCell>
        {newest ? (
          <>
            <a
              href={versionUrl(env.VITE_API_URL, tenant.slug, newest.id)}
              className="text-primary font-medium underline"
            >
              <Trans>Version {number}</Trans>
            </a>
            <span className="text-muted-foreground">
              {' · '}
              {time.format(newest.publishedAt)}
            </span>
          </>
        ) : (
          <Trans>No version is published yet.</Trans>
        )}
      </TableCell>
      {canWrite && (
        <TableCell>
          <Button
            variant="outline"
            disabled={update.isPending}
            onClick={() =>
              update.mutate({
                params: { editionId: document.editionId, documentId: document.id },
                body: { hidden: !document.hidden },
              })
            }
          >
            {document.hidden ? <Trans>Show in the shop</Trans> : <Trans>Hide from the shop</Trans>}
          </Button>
        </TableCell>
      )}
    </LinkRow>
  )
}

/**
 * One consent in the table: the sentence a buyer accepts, whether the buyer must, and the document
 * it links; its place among the consents and its hiding for a member who may change it.
 */
function ConsentRow({
  consent,
  linked,
  to,
  last,
}: {
  consent: Consent
  linked: EditionDocument | undefined
  to: string | undefined
  /** Whether it holds the last place of the list. */
  last: boolean
}) {
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const params = { editionId: consent.editionId, consentId: consent.id }
  const update = useMutation({
    ...updateConsentOptions(api),
    meta: { success: msg`The consent is saved.` },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shopKey(api) }),
  })
  const move = (position: number) => update.mutate({ params, body: { position } })

  return (
    <LinkRow to={to}>
      <TableCell className="whitespace-normal">
        <div className="flex flex-wrap items-center gap-2">
          {to ? <RowLink to={to}>{consent.text}</RowLink> : <span>{consent.text}</span>}
          {consent.hidden && (
            <Badge variant="outline">
              <Trans context="a consent">Hidden from the shop</Trans>
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {consent.isRequired ? (
          <Trans context="a consent">Required</Trans>
        ) : (
          <Trans context="a consent">Optional</Trans>
        )}
      </TableCell>
      <TableCell>{linked?.title ?? '—'}</TableCell>
      {to && (
        <TableCell>
          <div className="flex flex-wrap gap-2">
            {consent.position > 1 && (
              <Button
                variant="outline"
                disabled={update.isPending}
                onClick={() => move(consent.position - 1)}
              >
                <Trans>Move up</Trans>
              </Button>
            )}
            {!last && (
              <Button
                variant="outline"
                disabled={update.isPending}
                onClick={() => move(consent.position + 1)}
              >
                <Trans>Move down</Trans>
              </Button>
            )}
            <Button
              variant="outline"
              disabled={update.isPending}
              onClick={() => update.mutate({ params, body: { hidden: !consent.hidden } })}
            >
              {consent.hidden ? <Trans>Show in the shop</Trans> : <Trans>Hide from the shop</Trans>}
            </Button>
          </div>
        </TableCell>
      )}
    </LinkRow>
  )
}
