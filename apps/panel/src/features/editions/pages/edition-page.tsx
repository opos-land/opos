import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Button,
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { EditionForm } from '../components/edition-form'
import { EditionStatus } from '../components/edition-status'
import { useEditionBySlug } from '../hooks/use-editions'

/** Edition data, activation, publication and deletion; everything but reading needs settings=write. */
export function EditionPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canWrite = atLeast(access.settings, 'write')
  const base = `/${tenant.slug}/editions`

  const refresh = () => queryClient.invalidateQueries({ queryKey: api.editions.key() })
  const update = useMutation({
    ...api.editions.update.mutationOptions(),
    onSuccess: async (saved) => {
      await refresh()
      if (saved.slug !== editionSlug) void navigate(`${base}/${saved.slug}`, { replace: true })
    },
  })
  const publish = useMutation({ ...api.editions.update.mutationOptions(), onSuccess: refresh })
  const activate = useMutation({ ...api.editions.activate.mutationOptions(), onSuccess: refresh })
  const remove = useMutation({
    ...api.editions.remove.mutationOptions(),
    onSuccess: async () => {
      await refresh()
      void navigate(base, { replace: true })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition) return <NoPermissionView />

  const params = { editionId: edition.id }
  const editionName = edition.name
  return (
    <>
      <PageHeader
        title={edition.name}
        description={time.range(edition.startsAt, edition.endsAt)}
        actions={<EditionStatus edition={edition} />}
      />
      <Section title={<Trans>Edition data</Trans>}>
        <EditionForm
          defaultValues={{
            name: edition.name,
            slug: edition.slug,
            startsAt: time.toInput(edition.startsAt),
            endsAt: time.toInput(edition.endsAt),
          }}
          disabled={!canWrite}
          pending={update.isPending}
          error={update.error}
          submitLabel={<Trans>Save</Trans>}
          onSubmit={(body) => update.mutate({ params, body })}
        />
      </Section>
      {canWrite && (
        <Section title={<Trans>Activation and publication</Trans>}>
          <div className="flex flex-col gap-2 text-sm">
            <p>
              {edition.isActive
                ? t`This is the convention's active edition.`
                : t`Activating this edition makes it the convention's active one; the edition active now stops being active.`}
            </p>
            {!edition.isActive && (
              <div>
                <Button pending={activate.isPending} onClick={() => activate.mutate({ params })}>
                  <Trans>Activate</Trans>
                </Button>
              </div>
            )}
            <ErrorMessage error={activate.error} />
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <p>
              {edition.isPublished ? (
                <Trans>The edition is published: the portal shows it to everyone.</Trans>
              ) : (
                <Trans>The edition is not published: the portal does not show it.</Trans>
              )}
            </p>
            <div>
              <Button
                variant="secondary"
                pending={publish.isPending}
                onClick={() =>
                  publish.mutate({ params, body: { isPublished: !edition.isPublished } })
                }
              >
                {edition.isPublished ? <Trans>Unpublish</Trans> : <Trans>Publish</Trans>}
              </Button>
            </div>
            <ErrorMessage error={publish.error} />
          </div>
        </Section>
      )}
      {atLeast(access.settings, 'read') && (
        <Section title={<Trans>Access</Trans>}>
          <p className="text-sm">
            <Link to={`${base}/${edition.slug}/access`} className="text-accent underline">
              {t`Team members' permissions in this edition`}
            </Link>
          </p>
        </Section>
      )}
      {canWrite && (
        <Section title={<Trans>Delete the edition</Trans>}>
          <p className="text-sm">
            <Trans>
              Deleting an edition cannot be undone. The active edition cannot be deleted.
            </Trans>
          </p>
          {confirmDelete ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                pending={remove.isPending}
                onClick={() => remove.mutate({ params })}
              >
                <Trans>Yes, delete {editionName}</Trans>
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                <Trans>Cancel</Trans>
              </Button>
            </div>
          ) : (
            <div>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trans>Delete</Trans>
              </Button>
            </div>
          )}
          <ErrorMessage error={remove.error} />
        </Section>
      )}
    </>
  )
}
