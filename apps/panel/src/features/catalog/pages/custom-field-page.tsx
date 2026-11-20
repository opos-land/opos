import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  IrreversibleAction,
  LoadingView,
  NoPermissionView,
  NotFoundView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import {
  catalogKey,
  customFieldsOptions,
  removeCustomFieldOptions,
  updateCustomFieldOptions,
} from '../api/catalog'
import { CustomFieldForm } from '../components/custom-field-form'
import { SensitiveDataNotice } from '../components/sensitive-data-notice'

/**
 * One custom field of an edition (`/editions/:editionSlug/ticket-holders/custom-fields/:fieldId`),
 * for a member with tickets=write in the edition: what it asks and whether an answer is required,
 * and its deletion. Its place among the fields and whether the shop asks for it are changed in
 * their list, on the ticket holders' data page.
 */
export function CustomFieldPage() {
  const { t } = useLingui()
  const { editionSlug, fieldId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const canWrite = edition ? atLeast(access.edition(edition.id).tickets, 'write') : false
  const fields = useQuery({ ...customFieldsOptions(api, edition?.id ?? ''), enabled: canWrite })
  const field = fields.data?.find((entry) => entry.id === fieldId)
  usePageTitle(field?.label ?? t`Ticket holders’ data`, edition?.name ?? tenant.name)
  const list = `/${tenant.slug}/editions/${editionSlug ?? ''}/ticket-holders`
  const label = field?.label ?? ''

  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogKey(api) })
  const update = useMutation({
    ...updateCustomFieldOptions(api),
    meta: { success: msg`The custom field is saved.` },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removeCustomFieldOptions(api),
    meta: { success: msg`The custom field “${label}” is deleted.` },
    onSuccess: async () => {
      await refresh()
      void navigate(list, { replace: true })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canWrite) return <NoPermissionView />
  if (fields.isPending) return <LoadingView />
  if (fields.isError) return <ErrorMessage error={fields.error} />
  if (!field) return <NotFoundView />

  const params = { editionId: edition.id, fieldId: field.id }
  return (
    <>
      <PageHeader title={field.label} description={edition.name} />
      <p className="text-sm">
        <Link to={list} className="text-primary underline">
          <Trans>Ticket holders’ data</Trans>
        </Link>
      </p>
      <Section title={<Trans>Custom field data</Trans>}>
        <SensitiveDataNotice />
        <CustomFieldForm
          // The saved field fills the form anew.
          key={JSON.stringify(field)}
          initial={field}
          pending={update.isPending}
          submitLabel={t`Save the custom field`}
          onSubmit={(body) => update.mutate({ params, body })}
        />
      </Section>
      <Section title={<Trans>Delete the custom field</Trans>}>
        <p className="text-sm">
          <Trans>
            Deleting a custom field cannot be undone. To stop asking for a while, hide it in the
            list of custom fields instead.
          </Trans>
        </p>
        <div>
          <IrreversibleAction
            label={<Trans>Delete the custom field</Trans>}
            title={<Trans>Delete the custom field “{label}”?</Trans>}
            action={<Trans>Delete the custom field</Trans>}
            onConfirm={() => remove.mutateAsync({ params })}
          >
            <Trans>The shop stops asking for it.</Trans>
          </IrreversibleAction>
        </div>
      </Section>
    </>
  )
}
