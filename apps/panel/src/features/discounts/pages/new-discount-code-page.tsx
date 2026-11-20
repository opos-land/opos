import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { addOnsOptions, merchandiseOptions, ticketTypesOptions } from '../../catalog'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { createDiscountCodeOptions, discountCodesKey } from '../api/discount-codes'
import { DiscountCodeForm } from '../components/discount-code-form'
import { EMPTY_DISCOUNT_CODE } from '../model/discount-code-form'

/**
 * A new discount code of an edition (`/editions/:editionSlug/discount-codes/new`,
 * docs/specs/0008-discount-codes.md, D1-D4), for a member with tickets=write in the edition. Once
 * the code is added the member is led back to the codes.
 */
export function NewDiscountCodePage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`New discount code`, edition?.name ?? tenant.name)
  const canWrite = edition ? atLeast(access.edition(edition.id).tickets, 'write') : false
  const editionId = edition?.id ?? ''
  // What a code applies to is named from the edition's catalog, which the same permission reads.
  const ticketTypes = useQuery({ ...ticketTypesOptions(api, editionId), enabled: canWrite })
  const addOns = useQuery({ ...addOnsOptions(api, editionId), enabled: canWrite })
  const items = useQuery({ ...merchandiseOptions(api, editionId), enabled: canWrite })
  // A new code is valid from now until the edition ends, unless the org says otherwise.
  const [opened] = useState(() => new Date().toISOString())
  const list = `/${tenant.slug}/editions/${editionSlug ?? ''}/discount-codes`
  const create = useMutation({
    ...createDiscountCodeOptions(api),
    meta: { success: msg`The code is added.` },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountCodesKey(api) })
      void navigate(list)
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canWrite) return <NoPermissionView />

  const reading = ticketTypes.isPending || addOns.isPending || items.isPending
  const failure = ticketTypes.error ?? addOns.error ?? items.error
  return (
    <>
      <PageHeader title={<Trans>New discount code</Trans>} description={edition.name} />
      <p className="text-sm">
        <Link to={list} className="text-primary underline">
          <Trans>All discount codes</Trans>
        </Link>
      </p>
      <Section title={<Trans>Discount code data</Trans>}>
        {reading ? (
          <LoadingView />
        ) : failure ? (
          <ErrorMessage error={failure} />
        ) : (
          <DiscountCodeForm
            initial={{
              ...EMPTY_DISCOUNT_CODE,
              validFrom: time.toInput(opened),
              validUntil: time.toInput(edition.endsAt),
            }}
            catalog={{
              ticketTypes: ticketTypes.data ?? [],
              addOns: addOns.data ?? [],
              items: items.data ?? [],
            }}
            pending={create.isPending}
            submitLabel={<Trans>Add the code</Trans>}
            onSubmit={(body) => create.mutate({ params: { editionId: edition.id }, body })}
          />
        )}
      </Section>
    </>
  )
}
