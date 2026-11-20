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
import { addOnsOptions, merchandiseOptions, ticketTypesOptions, useMoney } from '../../catalog'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import {
  discountCodesKey,
  discountCodesOptions,
  removeDiscountCodeOptions,
  updateDiscountCodeOptions,
} from '../api/discount-codes'
import { DiscountCodeForm } from '../components/discount-code-form'
import { discountCodeFields, shownCode } from '../model/discount-code-form'

/**
 * One discount code of an edition (`/editions/:editionSlug/discount-codes/:codeId`,
 * docs/specs/0008-discount-codes.md, D1-D4), for a member with tickets=write in the edition: its
 * fields, and its deletion. Ending it and letting it run again are in the list of the codes.
 */
export function DiscountCodePage() {
  const { t } = useLingui()
  const { editionSlug, codeId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const money = useMoney()
  const time = useTenantTime()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const canWrite = edition ? atLeast(access.edition(edition.id).tickets, 'write') : false
  const editionId = edition?.id ?? ''
  const codes = useQuery({ ...discountCodesOptions(api, editionId), enabled: canWrite })
  // What a code applies to is named from the edition's catalog, which the same permission reads.
  const ticketTypes = useQuery({ ...ticketTypesOptions(api, editionId), enabled: canWrite })
  const addOns = useQuery({ ...addOnsOptions(api, editionId), enabled: canWrite })
  const items = useQuery({ ...merchandiseOptions(api, editionId), enabled: canWrite })
  const code = codes.data?.find((entry) => entry.id === codeId)
  const name = code ? shownCode(code.code) : ''
  usePageTitle(code ? name : t`Discount codes`, edition?.name ?? tenant.name)
  const list = `/${tenant.slug}/editions/${editionSlug ?? ''}/discount-codes`

  const refresh = () => queryClient.invalidateQueries({ queryKey: discountCodesKey(api) })
  const update = useMutation({
    ...updateDiscountCodeOptions(api),
    meta: { success: msg`The code is saved.` },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removeDiscountCodeOptions(api),
    meta: { success: msg`The code “${name}” is deleted.` },
    onSuccess: async () => {
      await refresh()
      void navigate(list, { replace: true })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canWrite) return <NoPermissionView />
  if (codes.isPending || ticketTypes.isPending || addOns.isPending || items.isPending) {
    return <LoadingView />
  }
  const failure = codes.error ?? ticketTypes.error ?? addOns.error ?? items.error
  if (failure) return <ErrorMessage error={failure} />
  if (!code) return <NotFoundView />

  const params = { editionId: edition.id, codeId: code.id }
  return (
    <>
      <PageHeader title={name} description={edition.name} />
      <p className="text-sm">
        <Link to={list} className="text-primary underline">
          <Trans>All discount codes</Trans>
        </Link>
      </p>
      <Section title={<Trans>Discount code data</Trans>}>
        <DiscountCodeForm
          // The saved code fills the form anew.
          key={JSON.stringify(code)}
          initial={discountCodeFields(code, {
            toInput: money.toInput,
            toInputTime: time.toInput,
          })}
          catalog={{
            ticketTypes: ticketTypes.data ?? [],
            addOns: addOns.data ?? [],
            items: items.data ?? [],
          }}
          pending={update.isPending}
          submitLabel={<Trans>Save the code</Trans>}
          onSubmit={(body) => update.mutate({ params, body })}
        />
      </Section>
      <Section title={<Trans>Delete the code</Trans>}>
        <p className="text-sm">
          <Trans>
            Deleting a code cannot be undone. To stop it for a while, end it in the list of discount
            codes instead.
          </Trans>
        </p>
        <div>
          <IrreversibleAction
            label={<Trans>Delete the code</Trans>}
            title={<Trans>Delete the code “{name}”?</Trans>}
            action={<Trans>Delete the code</Trans>}
            onConfirm={() => remove.mutateAsync({ params })}
          >
            <Trans>
              Buyers can no longer use it. A code an order used cannot be deleted: end it instead,
              and it stays on its orders.
            </Trans>
          </IrreversibleAction>
        </div>
      </Section>
    </>
  )
}
