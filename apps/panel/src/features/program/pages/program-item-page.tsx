import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  NotFoundView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import {
  programItemsOptions,
  programKey,
  removeProgramItemOptions,
  updateProgramItemOptions,
} from '../api/program'
import { ProgramItemForm } from '../components/program-item-form'
import { SpeakersEditor } from '../components/speakers-editor'

/** One programme item: its data, speakers and deletion; everything but reading needs program=write. */
export function ProgramItemPage() {
  const { t } = useLingui()
  const { editionSlug, programItemId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const level = edition ? access.edition(edition.id).program : 'none'
  const canWrite = atLeast(level, 'write')
  const items = useQuery({
    ...programItemsOptions(api, edition?.id ?? ''),
    enabled: atLeast(level, 'read'),
  })
  const item = items.data?.find((entry) => entry.id === programItemId)
  usePageTitle(item?.title ?? t`Programme`, edition?.name ?? tenant.name)
  const base = `/${tenant.slug}/editions/${editionSlug ?? ''}/program`

  const refresh = () => queryClient.invalidateQueries({ queryKey: programKey(api) })
  const update = useMutation({ ...updateProgramItemOptions(api), onSuccess: refresh })
  const remove = useMutation({
    ...removeProgramItemOptions(api),
    onSuccess: async () => {
      await refresh()
      void navigate(base, { replace: true })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !atLeast(level, 'read')) return <NoPermissionView />
  if (items.isPending) return <LoadingView />
  if (items.isError) return <ErrorMessage error={items.error} />

  if (!item) return <NotFoundView />

  const params = { editionId: edition.id, programItemId: item.id }
  const title = item.title
  return (
    <>
      <PageHeader title={item.title} description={time.range(item.startsAt, item.endsAt)} />
      <p className="text-sm">
        <Link to={base} className="text-accent underline">
          <Trans>All programme items</Trans>
        </Link>
      </p>
      <Section title={<Trans>Programme item data</Trans>}>
        <ProgramItemForm
          defaultValues={{
            title: item.title,
            description: item.description ?? '',
            startsAt: time.toInput(item.startsAt),
            endsAt: time.toInput(item.endsAt),
          }}
          disabled={!canWrite}
          pending={update.isPending}
          error={update.error}
          submitLabel={<Trans>Save</Trans>}
          onSubmit={(body) => update.mutate({ params, body })}
        />
      </Section>
      <Section title={<Trans>Speakers</Trans>}>
        <SpeakersEditor item={item} canWrite={canWrite} />
      </Section>
      {canWrite && (
        <Section title={<Trans>Delete the programme item</Trans>}>
          <p className="text-sm">
            <Trans>Deleting a programme item cannot be undone.</Trans>
          </p>
          {confirmDelete ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                pending={remove.isPending}
                onClick={() => remove.mutate({ params })}
              >
                <Trans>Yes, delete {title}</Trans>
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
