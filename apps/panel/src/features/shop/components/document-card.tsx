import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { DOCUMENT_TYPES, type EditionDocument } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { env } from '../../../shared/config/env'
import { toUpload } from '../../../shared/lib/file-upload'
import { notifyFailure } from '../../../shared/lib/notify'
import { Badge, Button, FormField, Input, IrreversibleAction } from '../../../shared/ui'
import { useCurrentTenant, useTenantTime } from '../../tenants'
import {
  publishVersionOptions,
  removeDocumentOptions,
  shopKey,
  updateDocumentOptions,
} from '../api/shop'
import { documentProblem, fileSize, KIND_LABELS, versionUrl } from '../model/documents'

/**
 * One legal document of an edition: its kind, its versions with where anyone reads each, and, for
 * a member with tickets=write, its title, a new version, hiding and deletion. A version is
 * published once: a correction is a new version.
 */
export function DocumentCard({
  document,
  canWrite,
}: {
  document: EditionDocument
  canWrite: boolean
}) {
  const { t, i18n } = useLingui()
  const { tenant, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const headingId = useId()
  const [title, setTitle] = useState(document.title)
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<'type' | 'size' | null>(null)
  // A new key empties the file field once its file is sent.
  const [field, setField] = useState(0)
  const params = { editionId: document.editionId, documentId: document.id }
  const name = document.title

  // The shop of the edition reads which documents have a published version.
  const refresh = () => queryClient.invalidateQueries({ queryKey: shopKey(api) })
  const update = useMutation({
    ...updateDocumentOptions(api),
    meta: { success: msg`The document is saved.` },
    onSuccess: refresh,
  })
  const publish = useMutation({
    ...publishVersionOptions(api),
    meta: { success: msg`The new version of ${name} is published.` },
    onSuccess: async () => {
      setFile(null)
      setField((key) => key + 1)
      await refresh()
    },
  })
  const remove = useMutation({
    ...removeDocumentOptions(api),
    meta: { success: msg`The document ${name} is deleted.` },
    onSuccess: refresh,
  })

  const choose = (chosen: File | undefined) => {
    const found = chosen ? documentProblem(chosen) : null
    setProblem(found)
    setFile(chosen && !found ? chosen : null)
  }
  /** Reading the file comes before the mutation, so a file that cannot be read is told here. */
  const send = async () => {
    if (!file) return
    try {
      publish.mutate({ params, body: { file: await toUpload(file) } })
    } catch (error) {
      notifyFailure(error)
    }
  }
  const trimmed = title.trim()

  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="font-medium">
          {document.title}
        </h3>
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
        <ul className="flex flex-col gap-1 text-sm">
          {document.versions.map((version) => {
            const number = version.number
            return (
              <li key={version.id}>
                <a
                  href={versionUrl(env.VITE_API_URL, tenant.slug, version.id)}
                  className="text-primary font-medium underline"
                >
                  <Trans>Version {number}</Trans>
                </a>
                <span className="text-muted-foreground">
                  {' · '}
                  {time.format(version.publishedAt)}
                  {' · '}
                  {version.file.name} ({fileSize(version.file.size, i18n.locale)})
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {canWrite && (
        <div className="flex max-w-lg flex-col gap-4">
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
              variant="outline"
              disabled={!trimmed || trimmed === document.title || update.isPending}
              onClick={() => update.mutate({ params, body: { title: trimmed } })}
            >
              <Trans>Save the title</Trans>
            </Button>
          </div>
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
          <div className="flex flex-wrap gap-3">
            <Button disabled={!file || publish.isPending} onClick={() => void send()}>
              <Trans>Publish the version</Trans>
            </Button>
            <Button
              variant="outline"
              disabled={update.isPending}
              onClick={() => update.mutate({ params, body: { hidden: !document.hidden } })}
            >
              {document.hidden ? (
                <Trans>Show in the shop</Trans>
              ) : (
                <Trans>Hide from the shop</Trans>
              )}
            </Button>
            <IrreversibleAction
              label={<Trans>Delete the document</Trans>}
              title={<Trans>Delete the document {name}?</Trans>}
              action={<Trans>Delete the document</Trans>}
              onConfirm={() => remove.mutateAsync({ params })}
            >
              <Trans>Its versions and their files go with it, and their links stop working.</Trans>
            </IrreversibleAction>
          </div>
        </div>
      )}
    </article>
  )
}
