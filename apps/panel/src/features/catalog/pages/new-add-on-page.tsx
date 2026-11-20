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
import { catalogKey, createAddOnOptions } from '../api/catalog'
import { AddOnForm } from '../components/add-on-form'
import { EMPTY_ADD_ON } from '../model/add-on-form'

/**
 * A new add-on of an edition (`/editions/:editionSlug/add-ons/new`), for a member with
 * tickets=write in the edition. It joins the end of the add-ons, where the member is led back.
 */
export function NewAddOnPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`New add-on`, edition?.name ?? tenant.name)
  const list = `/${tenant.slug}/editions/${editionSlug ?? ''}/add-ons`
  const create = useMutation({
    ...createAddOnOptions(api),
    meta: { success: msg`The add-on is added.` },
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
      <PageHeader title={<Trans>New add-on</Trans>} description={edition.name} />
      <p className="text-sm">
        <Link to={list} className="text-primary underline">
          <Trans>All add-ons</Trans>
        </Link>
      </p>
      <Section title={<Trans>Add-on data</Trans>}>
        <AddOnForm
          initial={EMPTY_ADD_ON}
          pending={create.isPending}
          submitLabel={<Trans>Add the add-on</Trans>}
          onSubmit={(body) => create.mutate({ params: { editionId }, body })}
        />
      </Section>
    </>
  )
}
