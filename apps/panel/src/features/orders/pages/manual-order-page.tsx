import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AgeBand, MANUAL_REASONS, type ManualReason } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  CheckboxField,
  ErrorMessage,
  FormField,
  Input,
  LoadingView,
  NativeSelect,
  NativeSelectOption,
  NoPermissionView,
  PageHeader,
  Section,
  Textarea,
} from '../../../shared/ui'
import {
  addOnsOptions,
  customFieldsOptions,
  merchandiseOptions,
  ticketTypesOptions,
  useMoney,
} from '../../catalog'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import { createManualOrderOptions, ordersKey } from '../api/orders'
import { AGE_BAND_LABELS, MANUAL_REASON_LABELS } from '../model/labels'
import {
  EMPTY_MANUAL_ORDER,
  manualOrderBody,
  type ManualOrderDraft,
  manualOrderLines,
  offeredTo,
} from '../model/manual-order'

/**
 * A new manual order (`/editions/:editionSlug/orders/new`): a sale made outside the shop, at a
 * desk, by invoice or complimentary, recorded at the prices in force
 * (docs/specs/0006-order-management.md, M1-M6). Needs tickets=write in the edition.
 */
export function ManualOrderPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const money = useMoney()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`New manual order`, edition?.name ?? tenant.name)
  const canWrite = edition ? atLeast(access.edition(edition.id).tickets, 'write') : false
  const editionId = edition?.id ?? ''
  const ticketTypes = useQuery({ ...ticketTypesOptions(api, editionId), enabled: canWrite })
  const addOns = useQuery({ ...addOnsOptions(api, editionId), enabled: canWrite })
  const items = useQuery({ ...merchandiseOptions(api, editionId), enabled: canWrite })
  const fields = useQuery({ ...customFieldsOptions(api, editionId), enabled: canWrite })
  const [draft, setDraft] = useState<ManualOrderDraft>(EMPTY_MANUAL_ORDER)
  // The moment the screen was opened: the API prices again when the order is recorded.
  const [now] = useState(() => new Date())
  const change = (changes: Partial<ManualOrderDraft>) =>
    setDraft((held) => ({ ...held, ...changes }))
  const record = useMutation({
    ...createManualOrderOptions(api),
    meta: { success: msg`The order is recorded.` },
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ordersKey(api) })
      if (edition) {
        await navigate(`/${tenant.slug}/editions/${edition.slug}/orders/${order.id}`)
      }
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canWrite) return <NoPermissionView />
  const loading = [ticketTypes, addOns, items, fields].find((query) => !query.isSuccess)
  if (loading) {
    return loading.isError ? <ErrorMessage error={loading.error} /> : <LoadingView />
  }

  const catalog = {
    ticketTypes: ticketTypes.data ?? [],
    addOns: addOns.data ?? [],
    items: items.data ?? [],
  }
  const offer = offeredTo(catalog, draft.ticketTypeId, now)
  const { lines, totalMinor } = manualOrderLines(catalog, draft, now)
  const asked = (fields.data ?? []).filter((field) => !field.hidden)
  const bands = offer.ticketType?.ageBands ?? []
  const ready = lines.length > 0 && (!offer.ticketType || draft.ageBand !== '')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    record.mutate({ params: { editionId }, body: manualOrderBody(catalog, draft, now) })
  }

  return (
    <>
      <PageHeader title={<Trans>New manual order</Trans>} description={edition.name} />
      <form onSubmit={submit}>
        <Section title={<Trans>The sale</Trans>}>
          <p className="max-w-2xl text-sm">
            <Trans>
              A sale made outside the shop. What it sells is handed over as you record it: the order
              has no QR code and sends no email. A person who should hold a QR code ahead of the
              edition gets a 100% discount code instead, and places the order in the shop.
            </Trans>
          </p>
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <FormField label={<Trans>Reason</Trans>}>
              {(control) => (
                <NativeSelect
                  {...control}
                  value={draft.reason}
                  onChange={(event) => change({ reason: event.target.value as ManualReason })}
                >
                  {MANUAL_REASONS.map((reason) => (
                    <NativeSelectOption key={reason} value={reason}>
                      {t(MANUAL_REASON_LABELS[reason])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField label={<Trans>Ticket type</Trans>}>
              {(control) => (
                <NativeSelect
                  {...control}
                  value={draft.ticketTypeId}
                  onChange={(event) =>
                    // What goes with a ticket type goes with that one alone.
                    change({ ticketTypeId: event.target.value, addOnIds: [], ageBand: '' })
                  }
                >
                  <NativeSelectOption value="">{t`No ticket: merchandise alone`}</NativeSelectOption>
                  {offer.ticketTypes.map((type) => (
                    <NativeSelectOption key={type.id} value={type.id}>
                      {`${type.name} · ${money.format(type.priceMinor)}`}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          </div>
          <FormField
            label={<Trans>Note</Trans>}
            hint={<Trans>For the team, such as an invoice’s number.</Trans>}
          >
            {(control) => (
              <Textarea
                {...control}
                className="max-w-2xl"
                value={draft.note}
                maxLength={500}
                onChange={(event) => change({ note: event.target.value })}
              />
            )}
          </FormField>
        </Section>
        {offer.addOns.length > 0 && (
          <Section title={<Trans>Add-ons</Trans>}>
            {offer.addOns.map((addOn) => (
              <CheckboxField
                key={addOn.id}
                label={`${addOn.name} · ${money.format(addOn.amountMinor)}`}
                checked={draft.addOnIds.includes(addOn.id)}
                onChange={(checked) =>
                  change({
                    addOnIds: checked
                      ? [...draft.addOnIds, addOn.id]
                      : draft.addOnIds.filter((id) => id !== addOn.id),
                  })
                }
              />
            ))}
          </Section>
        )}
        {offer.items.length > 0 && (
          <Section title={<Trans>Merchandise</Trans>}>
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              {offer.items.flatMap((item) =>
                item.variants.map((variant) => (
                  <FormField
                    key={variant.id}
                    label={variant.label ? `${item.name} (${variant.label})` : item.name}
                    hint={money.format(item.amountMinor)}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        type="number"
                        min={0}
                        max={100}
                        value={draft.quantities[variant.id] ?? 0}
                        onChange={(event) =>
                          change({
                            quantities: {
                              ...draft.quantities,
                              [variant.id]: Math.max(
                                0,
                                Math.trunc(Number(event.target.value) || 0),
                              ),
                            },
                          })
                        }
                      />
                    )}
                  </FormField>
                )),
              )}
            </div>
          </Section>
        )}
        {offer.ticketType && (
          <Section title={<Trans>Ticket holder</Trans>}>
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <FormField label={<Trans>Age band</Trans>}>
                {(control) => (
                  <NativeSelect
                    {...control}
                    value={draft.ageBand}
                    required
                    onChange={(event) => change({ ageBand: event.target.value as AgeBand | '' })}
                  >
                    <NativeSelectOption value="">{t`Choose an age band`}</NativeSelectOption>
                    {bands.map((band) => (
                      <NativeSelectOption key={band} value={band}>
                        {t(AGE_BAND_LABELS[band])}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField label={<Trans>Ticket holder’s name (optional)</Trans>}>
                {(control) => (
                  <Input
                    {...control}
                    value={draft.holderName}
                    maxLength={200}
                    onChange={(event) => change({ holderName: event.target.value })}
                  />
                )}
              </FormField>
              {asked.map((field) => (
                <FormField key={field.id} label={field.label}>
                  {(control) => (
                    <Input
                      {...control}
                      value={draft.answers[field.id] ?? ''}
                      maxLength={200}
                      onChange={(event) =>
                        change({ answers: { ...draft.answers, [field.id]: event.target.value } })
                      }
                    />
                  )}
                </FormField>
              ))}
            </div>
            <p className="text-muted-foreground text-sm">
              <Trans>The name and the answers are optional for a manual order.</Trans>
            </p>
          </Section>
        )}
        <Section title={<Trans>Summary</Trans>}>
          {lines.length === 0 ? (
            <p className="text-sm">
              <Trans>Choose a ticket type or merchandise to record a sale.</Trans>
            </p>
          ) : (
            <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              {lines.map((line) => (
                <div key={line.name} className="contents">
                  <dt>{line.quantity > 1 ? `${line.quantity} × ${line.name}` : line.name}</dt>
                  <dd className="text-right tabular-nums">{money.format(line.amountMinor)}</dd>
                </div>
              ))}
              <dt className="font-medium">
                <Trans>Total</Trans>
              </dt>
              <dd className="text-right font-medium tabular-nums">{money.format(totalMinor)}</dd>
            </dl>
          )}
          <div>
            <Button type="submit" disabled={!ready || record.isPending}>
              <Trans>Record the order</Trans>
            </Button>
          </div>
        </Section>
      </form>
    </>
  )
}
