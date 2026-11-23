import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import { catalogKey, createCustomFieldOptions } from '../api/catalog'
import { CustomFieldForm } from '../components/custom-field-form'
import { SensitiveDataNotice } from '../components/sensitive-data-notice'

const NEW_FIELD = { label: '', isRequired: false }

/**
 * A new custom field of an edition (`/editions/:editionSlug/ticket-holders/custom-fields/new`),
 * for a member with tickets=write in the edition. It joins the end of the fields on the ticket
 * holders' data page, where the member is led back.
 */
export function NewCustomFieldPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`New custom field`, edition?.name ?? tenant.name)
  const list = `/${tenant.slug}/editions/${editionSlug ?? ''}/ticket-holders`
  const create = useMutation({
    ...createCustomFieldOptions(api),
    meta: { success: msg`The custom field is added.` },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: catalogKey(api) })
      void navigate(list)
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !atLeast(access.edition(edition.id).tickets, 'write')) {
    return <NoPermissionView />
  }

  const editionId = edition.id
  return (
    <>
      <PageHeader title={<Trans>New custom field</Trans>} description={edition.name} />
      <p className="text-sm">
        <Link to={list} className="text-primary underline">
          <Trans>Ticket holders’ data</Trans>
        </Link>
      </p>
      <Section title={<Trans>Custom field data</Trans>}>
        <SensitiveDataNotice />
        <CustomFieldForm
          initial={NEW_FIELD}
          pending={create.isPending}
          submitLabel={t`Add the custom field`}
          onSubmit={(body) => create.mutate({ params: { editionId }, body })}
        />
      </Section>
    </>
  )
}
