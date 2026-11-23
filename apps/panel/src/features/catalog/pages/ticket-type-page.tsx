import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type TicketType } from '@opos/contract'
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
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import {
  addOnsOptions,
  catalogKey,
  createTicketTypeOptions,
  merchandiseOptions,
  removeTicketTypeOptions,
  ticketTypesOptions,
  updateTicketTypeOptions,
} from '../api/catalog'
import { TicketTypeForm } from '../components/ticket-type-form'
import { useMoney } from '../hooks/use-money'
import { EMPTY_TICKET_TYPE, ticketTypeFields } from '../model/ticket-type-form'

/**
 * One ticket type (`/editions/:editionSlug/ticket-types/:ticketTypeId`), or a new one at
 * `ticket-types/new`: its fields with its tiers, supporter prices, perks and what is offered with
 * it, and its deletion. Reading needs tickets>=read in the edition, changing tickets=write.
 */
export function TicketTypePage() {
  const { t } = useLingui()
  const { editionSlug, ticketTypeId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const money = useMoney()
  const time = useTenantTime()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const canWrite = atLeast(level, 'write')
  const editionId = edition?.id ?? ''
  const types = useQuery({ ...ticketTypesOptions(api, editionId), enabled: canRead })
  const addOns = useQuery({ ...addOnsOptions(api, editionId), enabled: canRead })
  const items = useQuery({ ...merchandiseOptions(api, editionId), enabled: canRead })
  const isNew = ticketTypeId === undefined
  const type = types.data?.find((entry) => entry.id === ticketTypeId)
  usePageTitle(
    isNew ? t`New ticket type` : (type?.name ?? t`Ticket types`),
    edition?.name ?? tenant.name,
  )
  const base = `/${tenant.slug}/editions/${editionSlug ?? ''}/ticket-types`

  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogKey(api) })
  const name = type?.name ?? ''
  const create = useMutation({
    ...createTicketTypeOptions(api),
    meta: {
      success: (made: TicketType) => {
        const added = made.name
        return msg`The ticket type “${added}” is added.`
      },
    },
    onSuccess: async (made) => {
      await refresh()
      void navigate(`${base}/${made.id}`, { replace: true })
    },
  })
  const update = useMutation({
    ...updateTicketTypeOptions(api),
    meta: { success: msg`The ticket type is saved.` },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removeTicketTypeOptions(api),
    meta: { success: msg`The ticket type “${name}” is deleted.` },
    onSuccess: async () => {
      await refresh()
      void navigate(base, { replace: true })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead || (isNew && !canWrite)) return <NoPermissionView />
  if (types.isPending || addOns.isPending || items.isPending) return <LoadingView />
  const failed = types.error ?? addOns.error ?? items.error
  if (failed) return <ErrorMessage error={failed} />
  if (!isNew && !type) return <NotFoundView />

  const back = (
    <p className="text-sm">
      <Link to={base} className="text-primary underline">
        <Trans>All ticket types</Trans>
      </Link>
    </p>
  )
  if (!type) {
    return (
      <>
        <PageHeader title={<Trans>New ticket type</Trans>} description={edition.name} />
        {back}
        <Section title={<Trans>Ticket type data</Trans>}>
          <TicketTypeForm
            initial={EMPTY_TICKET_TYPE}
            addOns={addOns.data ?? []}
            items={items.data ?? []}
            pending={create.isPending}
            submitLabel={<Trans>Add the ticket type</Trans>}
            onSubmit={(body) => create.mutate({ params: { editionId: edition.id }, body })}
          />
        </Section>
      </>
    )
  }

  const params = { editionId: edition.id, ticketTypeId: type.id }
  return (
    <>
      <PageHeader title={type.name} description={edition.name} />
      {back}
      <Section title={<Trans>Ticket type data</Trans>}>
        <TicketTypeForm
          // The saved ticket type fills the form anew, in the order the API holds its lists.
          key={JSON.stringify(type)}
          initial={ticketTypeFields(type, { toInput: money.toInput, toInputTime: time.toInput })}
          addOns={addOns.data ?? []}
          items={items.data ?? []}
          disabled={!canWrite}
          pending={update.isPending}
          submitLabel={<Trans>Save the ticket type</Trans>}
          onSubmit={(body) => update.mutate({ params, body })}
        />
      </Section>
      {canWrite && (
        <Section title={<Trans>Delete the ticket type</Trans>}>
          <p className="text-sm">
            <Trans>
              Deleting a ticket type cannot be undone. To take it out of the shop for a while, hide
              it in the list of ticket types instead.
            </Trans>
          </p>
          <div>
            <IrreversibleAction
              label={<Trans>Delete the ticket type</Trans>}
              title={<Trans>Delete the ticket type “{name}”?</Trans>}
              action={<Trans>Delete the ticket type</Trans>}
              onConfirm={() => remove.mutateAsync({ params })}
            >
              <Trans>Its price tiers, supporter prices and perks go with it.</Trans>
            </IrreversibleAction>
          </div>
        </Section>
      )}
    </>
  )
}
