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
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import { addOnsOptions, catalogKey, createAddOnOptions } from '../api/catalog'
import { AddOnForm } from '../components/add-on-form'
import { AddOnRow } from '../components/add-on-row'
import { EMPTY_ADD_ON } from '../model/add-on-form'

/**
 * The add-ons of an edition (`/editions/:editionSlug/add-ons`): the optional extras bought with a
 * ticket, in the order the shop shows them. Reading needs tickets>=read in the edition, changing
 * tickets=write.
 */
export function AddOnsPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const listId = useId()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Add-ons`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const addOns = useQuery({ ...addOnsOptions(api, edition?.id ?? ''), enabled: canRead })
  // A new key empties the form once its add-on is added.
  const [form, setForm] = useState(0)
  const create = useMutation({
    ...createAddOnOptions(api),
    meta: { success: msg`The add-on is added.` },
    onSuccess: async () => {
      setForm((key) => key + 1)
      await queryClient.invalidateQueries({ queryKey: catalogKey(api) })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  const editionId = edition.id
  return (
    <>
      <PageHeader title={<Trans>Add-ons</Trans>} description={edition.name} />
      <Section title={<Trans>Add-ons of the edition</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            Optional extras a buyer takes with a ticket, such as a workshop or a place in the
            sleeping room. A ticket type offers the add-ons you choose for it.
          </Trans>
        </p>
        {addOns.isPending ? (
          <LoadingView />
        ) : addOns.isError ? (
          <ErrorMessage error={addOns.error} />
        ) : addOns.data.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no add-ons yet.</Trans>
          </p>
        ) : (
          <>
            <h3 id={listId} className="sr-only">
              <Trans>Add-ons in their order</Trans>
            </h3>
            <ol aria-labelledby={listId} className="flex flex-col gap-3">
              {addOns.data.map((addOn, index) => (
                <AddOnRow
                  key={addOn.id}
                  addOn={addOn}
                  last={index === addOns.data.length - 1}
                  canWrite={canWrite}
                />
              ))}
            </ol>
          </>
        )}
      </Section>
      {canWrite && (
        <Section title={<Trans>New add-on</Trans>}>
          <AddOnForm
            key={form}
            initial={EMPTY_ADD_ON}
            pending={create.isPending}
            submitLabel={<Trans>Add the add-on</Trans>}
            onSubmit={(body) => create.mutate({ params: { editionId }, body })}
          />
        </Section>
      )}
    </>
  )
}
