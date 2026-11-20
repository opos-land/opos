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
import { addOnsOptions, catalogKey, removeAddOnOptions, updateAddOnOptions } from '../api/catalog'
import { AddOnForm } from '../components/add-on-form'
import { useMoney } from '../hooks/use-money'
import { addOnFields } from '../model/add-on-form'

/**
 * One add-on of an edition (`/editions/:editionSlug/add-ons/:addOnId`), for a member with
 * tickets=write in the edition: its fields, and its deletion. Its place in the list and whether
 * the shop shows it are changed in the list of the add-ons.
 */
export function AddOnPage() {
  const { t } = useLingui()
  const { editionSlug, addOnId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const money = useMoney()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const canWrite = edition ? atLeast(access.edition(edition.id).tickets, 'write') : false
  const addOns = useQuery({ ...addOnsOptions(api, edition?.id ?? ''), enabled: canWrite })
  const addOn = addOns.data?.find((entry) => entry.id === addOnId)
  usePageTitle(addOn?.name ?? t`Add-ons`, edition?.name ?? tenant.name)
  const list = `/${tenant.slug}/editions/${editionSlug ?? ''}/add-ons`
  const name = addOn?.name ?? ''

  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogKey(api) })
  const update = useMutation({
    ...updateAddOnOptions(api),
    meta: { success: msg`The add-on is saved.` },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removeAddOnOptions(api),
    meta: { success: msg`The add-on “${name}” is deleted.` },
    onSuccess: async () => {
      await refresh()
      void navigate(list, { replace: true })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canWrite) return <NoPermissionView />
  if (addOns.isPending) return <LoadingView />
  if (addOns.isError) return <ErrorMessage error={addOns.error} />
  if (!addOn) return <NotFoundView />

  const params = { editionId: edition.id, addOnId: addOn.id }
  return (
    <>
      <PageHeader title={addOn.name} description={edition.name} />
      <p className="text-sm">
        <Link to={list} className="text-primary underline">
          <Trans>All add-ons</Trans>
        </Link>
      </p>
      <Section title={<Trans>Add-on data</Trans>}>
        <AddOnForm
          // The saved add-on fills the form anew.
          key={JSON.stringify(addOn)}
          initial={addOnFields(addOn, money.toInput)}
          pending={update.isPending}
          submitLabel={<Trans>Save the add-on</Trans>}
          onSubmit={(body) => update.mutate({ params, body })}
        />
      </Section>
      <Section title={<Trans>Delete the add-on</Trans>}>
        <p className="text-sm">
          <Trans>
            Deleting an add-on cannot be undone. To take it out of the shop for a while, hide it in
            the list of add-ons instead.
          </Trans>
        </p>
        <div>
          <IrreversibleAction
            label={<Trans>Delete the add-on</Trans>}
            title={<Trans>Delete the add-on “{name}”?</Trans>}
            action={<Trans>Delete the add-on</Trans>}
            onConfirm={() => remove.mutateAsync({ params })}
          >
            <Trans>The shop stops offering it, and no ticket type offers it any more.</Trans>
          </IrreversibleAction>
        </div>
      </Section>
    </>
  )
}
