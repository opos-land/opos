import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useParams } from 'react-router'
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
import {
  createDiscountCodeOptions,
  discountCodesKey,
  discountCodesOptions,
} from '../api/discount-codes'
import { type CodeCatalog, DiscountCodeForm } from '../components/discount-code-form'
import { DiscountCodeRow } from '../components/discount-code-row'
import { EMPTY_DISCOUNT_CODE } from '../model/discount-code-form'

/**
 * The discount codes of an edition (`/editions/:editionSlug/discount-codes`,
 * docs/specs/0008-discount-codes.md): the codes by their text, each with the uses orders hold
 * against its limit, and the form of a new one. Reading needs tickets>=read in the edition,
 * changing tickets=write.
 */
export function DiscountCodesPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const listId = useId()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Discount codes`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const editionId = edition?.id ?? ''
  const codes = useQuery({ ...discountCodesOptions(api, editionId), enabled: canRead })
  // What a code applies to is named from the edition's catalog, which the same permission reads.
  const ticketTypes = useQuery({ ...ticketTypesOptions(api, editionId), enabled: canRead })
  const addOns = useQuery({ ...addOnsOptions(api, editionId), enabled: canRead })
  const items = useQuery({ ...merchandiseOptions(api, editionId), enabled: canRead })
  // A new key empties the form once its code is added.
  const [form, setForm] = useState(0)
  // A new code is valid from now until the edition ends, unless the org says otherwise.
  const [opened] = useState(() => new Date().toISOString())
  const create = useMutation({
    ...createDiscountCodeOptions(api),
    meta: { success: msg`The code is added.` },
    onSuccess: async () => {
      setForm((key) => key + 1)
      await queryClient.invalidateQueries({ queryKey: discountCodesKey(api) })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  const catalog: CodeCatalog = {
    ticketTypes: ticketTypes.data ?? [],
    addOns: addOns.data ?? [],
    items: items.data ?? [],
  }
  const reading = codes.isPending || ticketTypes.isPending || addOns.isPending || items.isPending
  const failure = codes.error ?? ticketTypes.error ?? addOns.error ?? items.error
  return (
    <>
      <PageHeader title={<Trans>Discount codes</Trans>} description={edition.name} />
      <Section title={<Trans>Discount codes of the edition</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            A buyer enters a code at the Summary of the checkout, and it lowers the price of what
            you chose for it. A code of 100% gives free entry: give one to a guest, who then checks
            out like any buyer and gets a QR code.
          </Trans>
        </p>
        {reading ? (
          <LoadingView />
        ) : failure ? (
          <ErrorMessage error={failure} />
        ) : codes.data?.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no discount codes yet.</Trans>
          </p>
        ) : (
          <>
            <h3 id={listId} className="sr-only">
              <Trans>Discount codes by their text</Trans>
            </h3>
            <ul aria-labelledby={listId} className="flex flex-col gap-3">
              {codes.data?.map((code) => (
                <DiscountCodeRow
                  key={code.id}
                  editionId={edition.id}
                  code={code}
                  catalog={catalog}
                  canWrite={canWrite}
                />
              ))}
            </ul>
          </>
        )}
      </Section>
      {canWrite && !reading && !failure && (
        <Section title={<Trans>New discount code</Trans>}>
          <DiscountCodeForm
            key={form}
            initial={{
              ...EMPTY_DISCOUNT_CODE,
              validFrom: time.toInput(opened),
              validUntil: time.toInput(edition.endsAt),
            }}
            catalog={catalog}
            pending={create.isPending}
            submitLabel={<Trans>Add the code</Trans>}
            onSubmit={(body) => create.mutate({ params: { editionId: edition.id }, body })}
          />
        </Section>
      )}
    </>
  )
}
