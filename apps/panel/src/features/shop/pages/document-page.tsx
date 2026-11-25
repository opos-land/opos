import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { DOCUMENT_TYPES, type EditionDocument } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { env } from '../../../shared/config/env'
import { toUpload } from '../../../shared/lib/file-upload'
import { notifyFailure } from '../../../shared/lib/notify'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  Button,
  ErrorMessage,
  FormField,
  Input,
  IrreversibleAction,
  LoadingView,
  NoPermissionView,
  NotFoundView,
  PageHeader,
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
  documentsOptions,
  publishVersionOptions,
  removeDocumentOptions,
  shopKey,
  updateDocumentOptions,
} from '../api/shop'
import { documentProblem, fileSize, KIND_LABELS, versionUrl } from '../model/documents'

/**
 * One legal document of an edition (`/editions/:editionSlug/documents/:documentId`): its versions
 * with where anyone reads each, for a member with tickets>=read in the edition; and for one with
 * tickets=write its title, a new version and its deletion. A version is published once: a
 * correction is a new version. Whether the shop shows the document is changed in the list.
 */
export function DocumentPage() {
  const { t } = useLingui()
  const { editionSlug, documentId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const documents = useQuery({ ...documentsOptions(api, edition?.id ?? ''), enabled: canRead })
  const document = documents.data?.find((entry) => entry.id === documentId)
  usePageTitle(document?.title ?? t`Documents and consents`, edition?.name ?? tenant.name)
  const list = `/${tenant.slug}/editions/${editionSlug ?? ''}/documents`

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />
  if (documents.isPending) return <LoadingView />
  if (documents.isError) return <ErrorMessage error={documents.error} />
  if (!document) return <NotFoundView />

  return (
    <>
      <PageHeader title={document.title} description={edition.name} />
      <p className="text-sm">
        <Link to={list} className="text-primary underline">
          <Trans>Documents and consents</Trans>
        </Link>
      </p>
      <Versions document={document} />
      {atLeast(level, 'write') && (
        // The saved title fills its form anew; a version published beside it does not.
        <Changes
          key={JSON.stringify([document.id, document.title])}
          document={document}
          list={list}
        />
      )}
    </>
  )
}

/** The versions of a document, the newest first, each a file anyone reads. */
function Versions({ document }: { document: EditionDocument }) {
  const { i18n } = useLingui()
  const { tenant } = useCurrentTenant()
  const time = useTenantTime()
  return (
    <Section title={<Trans>Versions</Trans>}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{i18n._(KIND_LABELS[document.kind])}</Badge>
        {document.hidden && (
          <Badge variant="outline">
            <Trans context="a document">Hidden from the shop</Trans>
          </Badge>
        )}
      </div>
      {document.versions.length === 0 ? (
        <p className="text-sm">
          <Trans>No version is published yet.</Trans>
        </p>
      ) : (
        <Table>
          <caption className="sr-only">
            <Trans>Versions of the document</Trans>
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">
                <Trans context="a document">Version</Trans>
              </TableHead>
              <TableHead scope="col">
                <Trans context="a document">Published</Trans>
              </TableHead>
              <TableHead scope="col">
                <Trans context="a document">File</Trans>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...document.versions]
              .sort((a, b) => b.number - a.number)
              .map((version) => {
                const number = version.number
                return (
                  <TableRow key={version.id}>
                    <TableCell>
                      <a
                        href={versionUrl(env.VITE_API_URL, tenant.slug, version.id)}
                        className="text-primary font-medium underline"
                      >
                        <Trans>Version {number}</Trans>
                      </a>
                    </TableCell>
                    <TableCell>{time.format(version.publishedAt)}</TableCell>
                    <TableCell>
                      {version.file.name} ({fileSize(version.file.size, i18n.locale)})
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      )}
    </Section>
  )
}

/** What a member with tickets=write does with a document: its title, a new version, its deletion. */
function Changes({ document, list }: { document: EditionDocument; list: string }) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(document.title)
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<'type' | 'size' | null>(null)
  // A new key empties the file field once its file is sent.
  const [field, setField] = useState(0)
  // From the press until the file is read and the request made: a second press sends nothing.
  const [sending, setSending] = useState(false)
  const params = { editionId: document.editionId, documentId: document.id }
  const documentTitle = document.title

  // The shop of the edition reads which documents have a published version.
  const refresh = () => queryClient.invalidateQueries({ queryKey: shopKey(api) })
  const update = useMutation({
    ...updateDocumentOptions(api),
    meta: { success: msg`The document is saved.` },
    onSuccess: refresh,
  })
  const publish = useMutation({
    ...publishVersionOptions(api),
    meta: { success: msg`The new version of “${documentTitle}” is published.` },
    onSuccess: async () => {
      setFile(null)
      setField((key) => key + 1)
      await refresh()
    },
  })
  const remove = useMutation({
    ...removeDocumentOptions(api),
    meta: { success: msg`The document “${documentTitle}” is deleted.` },
    onSuccess: async () => {
      await refresh()
      void navigate(list, { replace: true })
    },
  })

  const choose = (chosen: File | undefined) => {
    const found = chosen ? documentProblem(chosen) : null
    setProblem(found)
    setFile(chosen && !found ? chosen : null)
  }
  /** Reading the file comes before the mutation, so a file that cannot be read is told here. */
  const send = async () => {
    if (!file || sending) return
    setSending(true)
    try {
      const upload = await toUpload(file)
      // The write tells its own failure, as every mutation does.
      await publish.mutateAsync({ params, body: { file: upload } }).catch(() => undefined)
    } catch (error) {
      notifyFailure(error)
    } finally {
      setSending(false)
    }
  }
  const trimmed = title.trim()

  return (
    <>
      <Section title={<Trans>Publish a version</Trans>}>
        <div className="flex max-w-lg flex-col gap-4">
          <FormField
            label={t`New version`}
            hint={t`A PDF of up to 10 MB. A published version is never changed or removed: a correction is a new version.`}
            error={
              problem === 'type'
                ? t`Choose a PDF file.`
                : problem === 'size'
                  ? t`Choose a PDF of up to 10 MB.`
                  : undefined
            }
          >
            {(control) => (
              <Input
                {...control}
                key={field}
                type="file"
                accept={DOCUMENT_TYPES.join(',')}
                disabled={publish.isPending}
                onChange={(event) => choose(event.target.files?.[0])}
              />
            )}
          </FormField>
          <div>
            <Button disabled={!file || sending || publish.isPending} onClick={() => void send()}>
              <Trans>Publish the version</Trans>
            </Button>
          </div>
        </div>
      </Section>
      <Section title={<Trans>Document data</Trans>}>
        <form
          noValidate
          className="flex max-w-lg flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed && trimmed !== document.title) {
              update.mutate({ params, body: { title: trimmed } })
            }
          }}
        >
          <FormField label={t`Title`}>
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
            <Button
              type="submit"
              disabled={!trimmed || trimmed === document.title || update.isPending}
            >
              <Trans>Save the title</Trans>
            </Button>
          </div>
        </form>
      </Section>
      <Section title={<Trans>Delete the document</Trans>}>
        <p className="text-sm">
          <Trans>
            Deleting a document cannot be undone. To take it out of the shop for a while, hide it in
            the list of documents instead.
          </Trans>
        </p>
        <div>
          <IrreversibleAction
            label={<Trans>Delete the document</Trans>}
            title={<Trans>Delete the document “{documentTitle}”?</Trans>}
            action={<Trans>Delete the document</Trans>}
            onConfirm={() => remove.mutateAsync({ params })}
          >
            <Trans>Its versions and their files go with it, and their links stop working.</Trans>
          </IrreversibleAction>
        </div>
      </Section>
    </>
  )
}
