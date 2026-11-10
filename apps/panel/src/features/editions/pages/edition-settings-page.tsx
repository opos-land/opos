import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type Edition } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  IrreversibleAction,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import {
  activateEditionOptions,
  editionsKey,
  removeEditionOptions,
  updateEditionOptions,
} from '../api/editions'
import { EditionForm } from '../components/edition-form'
import { EditionStatus } from '../components/edition-status'
import { useEditionBySlug } from '../hooks/use-editions'

/**
 * The edition's settings: its data, activation, publication and deletion. Reading needs
 * settings>=read, everything else settings=write.
 */
export function EditionSettingsPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Edition settings`, edition?.name ?? tenant.name)
  const canWrite = atLeast(access.settings, 'write')
  const base = `/${tenant.slug}/editions`
  const list = `/${tenant.slug}/settings/editions`

  const editionName = edition?.name ?? ''
  const refresh = () => queryClient.invalidateQueries({ queryKey: editionsKey(api) })
  const update = useMutation({
    ...updateEditionOptions(api),
    meta: { success: msg`The edition is saved.` },
    onSuccess: async (saved) => {
      await refresh()
      if (saved.slug !== editionSlug) {
        void navigate(`${base}/${saved.slug}/settings`, { replace: true })
      }
    },
  })
  const publish = useMutation({
    ...updateEditionOptions(api),
    meta: {
      success: (saved: Edition) =>
        saved.isPublished
          ? msg`The edition ${editionName} is published.`
          : msg`The edition ${editionName} is no longer published.`,
    },
    onSuccess: refresh,
  })
  const activate = useMutation({
    ...activateEditionOptions(api),
    meta: { success: msg`The edition ${editionName} is now the active one.` },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removeEditionOptions(api),
    meta: { success: msg`The edition ${editionName} is deleted.` },
    onSuccess: async () => {
      await refresh()
      void navigate(list, { replace: true })
    },
  })

  if (!atLeast(access.settings, 'read')) return <NoPermissionView />
  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition) return <NoPermissionView />

  const params = { editionId: edition.id }
  return (
    <>
      <PageHeader
        title={<Trans>Edition settings</Trans>}
        description={edition.name}
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
                <Button disabled={activate.isPending} onClick={() => activate.mutate({ params })}>
                  <Trans>Activate</Trans>
                </Button>
              </div>
            )}
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
                disabled={publish.isPending}
                variant="outline"

                onClick={() =>
                  publish.mutate({ params, body: { isPublished: !edition.isPublished } })
                }
              >
                {edition.isPublished ? <Trans>Unpublish</Trans> : <Trans>Publish</Trans>}
              </Button>
            </div>
          </div>
        </Section>
      )}
      {canWrite && (
        <Section title={<Trans>Delete the edition</Trans>}>
          <p className="text-sm">
            <Trans>
              Deleting an edition cannot be undone. The active edition cannot be deleted.
            </Trans>
          </p>
          <div>
            <IrreversibleAction
              label={<Trans>Delete</Trans>}
              title={<Trans>Delete the edition {editionName}?</Trans>}
              action={<Trans>Delete the edition</Trans>}
              onConfirm={() => remove.mutateAsync({ params })}
            >
              <Trans>
                Its programme items, with their likes and lists of speakers, and the team’s access
                to the edition go with it.
              </Trans>
            </IrreversibleAction>
          </div>
        </Section>
      )}
    </>
  )
}
