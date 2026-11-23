import { Trans, useLingui } from '@lingui/react/macro'
import {
  AGE_BANDS,
  type AddOn,
  type AgeBand,
  type CreateTicketType,
  MAX_PERKS,
  MAX_PRICE_TIERS,
  MAX_SUPPORTER_PRICES,
  type MerchandiseItem,
} from '@opos/contract'
import { type ReactNode, useState } from 'react'
import {
  Button,
  CheckboxField,
  FieldSet,
  FormField,
  Input,
  NativeSelect,
  NativeSelectOption,
  Textarea,
} from '../../../shared/ui'
import { useTenantTime } from '../../tenants'
import { useMoney } from '../hooks/use-money'
import {
  ticketTypeBody,
  type TicketTypeFields,
  type TicketTypeProblem,
  type TierFields,
} from '../model/ticket-type-form'

const NEW_TIER: TierFields = { price: '', startsAt: '', endsAt: '' }

const without = <T,>(list: readonly T[], index: number) => list.filter((_, at) => at !== index)
const replaced = <T,>(list: readonly T[], index: number, entry: T) =>
  list.map((held, at) => (at === index ? entry : held))
const toggled = <T,>(list: readonly T[], entry: T, on: boolean) =>
  on ? [...list.filter((held) => held !== entry), entry] : list.filter((held) => held !== entry)

/**
 * The fields of a ticket type, for a new one and for one that exists: what it is called, when it
 * sells and at which prices, how many of it there are, whom it lets in and what is offered with
 * it. Its tiers, supporter prices, perks and offers are saved with it as whole lists.
 */
export function TicketTypeForm({
  initial,
  addOns,
  items,
  disabled = false,
  pending,
  submitLabel,
  onSubmit,
}: {
  initial: TicketTypeFields
  /** The add-ons and the merchandise items of the edition, which the ticket type may offer. */
  addOns: AddOn[]
  items: MerchandiseItem[]
  disabled?: boolean
  pending: boolean
  submitLabel: ReactNode
  onSubmit: (body: Required<CreateTicketType>) => void
}) {
  const { t } = useLingui()
  const money = useMoney()
  const time = useTenantTime()
  const [fields, setFields] = useState(initial)
  const [problems, setProblems] = useState<TicketTypeProblem[]>([])
  const set = (changes: Partial<TicketTypeFields>) => setFields((held) => ({ ...held, ...changes }))
  const wrong = (problem: TicketTypeProblem) => problems.includes(problem)
  const zone = time.timeZone
  const currency = money.currency
  const bands: Record<AgeBand, string> = { child: t`Child`, teen: t`Teen`, adult: t`Adult` }

  return (
    <form
      noValidate
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        const read = ticketTypeBody(fields, { parse: money.parse, fromInput: time.fromInput })
        setProblems('problems' in read ? read.problems : [])
        if ('body' in read) onSubmit(read.body)
      }}
    >
      <FieldSet disabled={disabled}>
        <FormField label={t`Name`} error={wrong('name') && t`Enter a name.`}>
          {(control) => (
            <Input
              {...control}
              value={fields.name}
              maxLength={100}
              onChange={(event) => set({ name: event.target.value })}
            />
          )}
        </FormField>
        <FormField
          label={t`Short description`}
          hint={t`Shown beside the name in the shop, up to 300 characters.`}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              maxLength={300}
              value={fields.shortDescription}
              onChange={(event) => set({ shortDescription: event.target.value })}
            />
          )}
        </FormField>
        <FormField
          label={t`Long description`}
          hint={t`Shown at the first step of the checkout, up to 5000 characters.`}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={5}
              maxLength={5000}
              value={fields.longDescription}
              onChange={(event) => set({ longDescription: event.target.value })}
            />
          )}
        </FormField>
      </FieldSet>

      <FieldSet disabled={disabled}>
        <h3 className="text-sm font-medium">
          <Trans>Sale</Trans>
        </h3>
        <FormField
          label={t`Sale starts`}
          hint={t`In the convention's time zone, ${zone}.`}
          error={
            wrong('saleWindow') && t`Enter when the sale starts and when it ends, the end later.`
          }
        >
          {(control) => (
            <Input
              {...control}
              type="datetime-local"
              value={fields.saleStartsAt}
              onChange={(event) => set({ saleStartsAt: event.target.value })}
            />
          )}
        </FormField>
        <FormField label={t`Sale ends`} hint={t`In the convention's time zone, ${zone}.`}>
          {(control) => (
            <Input
              {...control}
              type="datetime-local"
              value={fields.saleEndsAt}
              aria-invalid={wrong('saleWindow') ? true : undefined}
              onChange={(event) => set({ saleEndsAt: event.target.value })}
            />
          )}
        </FormField>
        <FormField label={t`Outside the sale window`}>
          {(control) => (
            <NativeSelect
              {...control}
              value={fields.shownOutsideSaleWindow ? 'shown' : 'hidden'}
              onChange={(event) => set({ shownOutsideSaleWindow: event.target.value === 'shown' })}
            >
              <NativeSelectOption value="hidden">
                {t`Hidden: the shop does not show the ticket type`}
              </NativeSelectOption>
              <NativeSelectOption value="shown">
                {t`Shown as not yet on sale or as closed, and not selectable`}
              </NativeSelectOption>
            </NativeSelect>
          )}
        </FormField>
        <FormField
          label={t`Capacity`}
          hint={t`How many of this ticket type may be sold. Leave it empty for no limit.`}
          error={wrong('capacity') && t`Enter a whole number, or leave it empty.`}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              value={fields.capacity}
              onChange={(event) => set({ capacity: event.target.value })}
            />
          )}
        </FormField>
      </FieldSet>

      <fieldset disabled={disabled} className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">
          <Trans>Age bands allowed</Trans>
        </legend>
        {AGE_BANDS.map((band) => (
          <CheckboxField
            key={band}
            label={bands[band]}
            checked={fields.ageBands.includes(band)}
            disabled={disabled}
            onChange={(on) => set({ ageBands: toggled(fields.ageBands, band, on) })}
          />
        ))}
        {wrong('ageBands') && (
          <p className="text-destructive text-sm">
            <Trans>Allow at least one age band.</Trans>
          </p>
        )}
      </fieldset>

      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium">
          <Trans>Price tiers</Trans>
        </legend>
        <p className="text-sm">
          <Trans>
            Each tier is a gross price from one moment until another. At a moment no tier covers,
            the ticket type is not on sale.
          </Trans>
        </p>
        {fields.tiers.map((tier, index) => {
          const number = index + 1
          const change = (changes: Partial<TierFields>) =>
            set({ tiers: replaced(fields.tiers, index, { ...tier, ...changes }) })
          return (
            <fieldset key={index} className="flex flex-col gap-3 rounded-lg border p-4">
              <legend className="px-1 text-sm">
                <Trans>Price tier {number}</Trans>
              </legend>
              <FormField label={t`Price (${currency})`}>
                {(control) => (
                  <Input
                    {...control}
                    inputMode="decimal"
                    value={tier.price}
                    onChange={(event) => change({ price: event.target.value })}
                  />
                )}
              </FormField>
              <FormField label={t`From`} hint={t`In the convention's time zone, ${zone}.`}>
                {(control) => (
                  <Input
                    {...control}
                    type="datetime-local"
                    value={tier.startsAt}
                    onChange={(event) => change({ startsAt: event.target.value })}
                  />
                )}
              </FormField>
              <FormField label={t`Until`} hint={t`In the convention's time zone, ${zone}.`}>
                {(control) => (
                  <Input
                    {...control}
                    type="datetime-local"
                    value={tier.endsAt}
                    onChange={(event) => change({ endsAt: event.target.value })}
                  />
                )}
              </FormField>
              {!disabled && (
                <div>
                  <Button
                    variant="outline"
                    onClick={() => set({ tiers: without(fields.tiers, index) })}
                  >
                    <Trans>Remove price tier {number}</Trans>
                  </Button>
                </div>
              )}
            </fieldset>
          )
        })}
        {wrong('tiers') && (
          <p className="text-destructive text-sm">
            <Trans>
              Give every tier a price and both moments, the second later than the first.
            </Trans>
          </p>
        )}
        {wrong('tiersOverlap') && (
          <p className="text-destructive text-sm">
            <Trans>
              Two tiers cover the same time. Change the moments so that the tiers do not overlap.
            </Trans>
          </p>
        )}
        {!disabled && fields.tiers.length < MAX_PRICE_TIERS && (
          <div>
            <Button variant="outline" onClick={() => set({ tiers: [...fields.tiers, NEW_TIER] })}>
              <Trans>Add a price tier</Trans>
            </Button>
          </div>
        )}
      </fieldset>

      <fieldset disabled={disabled} className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">
          <Trans>Supporter prices</Trans>
        </legend>
        <p className="text-sm">
          <Trans>
            Higher amounts a buyer may choose instead of the price of the tier. The shop offers only
            those above the price in force.
          </Trans>
        </p>
        {fields.supporterPrices.map((price, index) => {
          const number = index + 1
          return (
            <div key={index} className="flex flex-wrap items-end gap-3">
              <FormField label={t`Supporter price ${number} (${currency})`}>
                {(control) => (
                  <Input
                    {...control}
                    inputMode="decimal"
                    value={price}
                    onChange={(event) =>
                      set({
                        supporterPrices: replaced(
                          fields.supporterPrices,
                          index,
                          event.target.value,
                        ),
                      })
                    }
                  />
                )}
              </FormField>
              {!disabled && (
                <Button
                  variant="outline"
                  onClick={() => set({ supporterPrices: without(fields.supporterPrices, index) })}
                >
                  <Trans>Remove supporter price {number}</Trans>
                </Button>
              )}
            </div>
          )
        })}
        {wrong('supporterPrices') && (
          <p className="text-destructive text-sm">
            <Trans>Enter each supporter price as an amount above zero, each once.</Trans>
          </p>
        )}
        {!disabled && fields.supporterPrices.length < MAX_SUPPORTER_PRICES && (
          <div>
            <Button
              variant="outline"
              onClick={() => set({ supporterPrices: [...fields.supporterPrices, ''] })}
            >
              <Trans>Add a supporter price</Trans>
            </Button>
          </div>
        )}
      </fieldset>

      <fieldset disabled={disabled} className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">
          <Trans>Perks</Trans>
        </legend>
        <p className="text-sm">
          <Trans>
            What the ticket includes, such as a pin or a badge: shown to the buyer, never sold
            separately.
          </Trans>
        </p>
        {fields.perks.map((perk, index) => {
          const number = index + 1
          return (
            <div key={index} className="flex flex-wrap items-end gap-3">
              <FormField label={t`Perk ${number}`}>
                {(control) => (
                  <Input
                    {...control}
                    value={perk}
                    maxLength={100}
                    onChange={(event) =>
                      set({ perks: replaced(fields.perks, index, event.target.value) })
                    }
                  />
                )}
              </FormField>
              {!disabled && (
                <Button
                  variant="outline"
                  onClick={() => set({ perks: without(fields.perks, index) })}
                >
                  <Trans>Remove perk {number}</Trans>
                </Button>
              )}
            </div>
          )
        })}
        {!disabled && fields.perks.length < MAX_PERKS && (
          <div>
            <Button variant="outline" onClick={() => set({ perks: [...fields.perks, ''] })}>
              <Trans>Add a perk</Trans>
            </Button>
          </div>
        )}
      </fieldset>

      <fieldset disabled={disabled} className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">
          <Trans>Discounts</Trans>
        </legend>
        <CheckboxField
          label={<Trans>Excluded from discounts</Trans>}
          hint={<Trans>No discount code applies to this ticket type, and its page says so.</Trans>}
          checked={fields.discountsExcluded}
          disabled={disabled}
          onChange={(on) => set({ discountsExcluded: on })}
        />
      </fieldset>

      <fieldset disabled={disabled} className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">
          <Trans>Add-ons offered with it</Trans>
        </legend>
        {addOns.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no add-ons yet.</Trans>
          </p>
        ) : (
          addOns.map((addOn) => (
            <CheckboxField
              key={addOn.id}
              label={addOn.name}
              checked={fields.addOnIds.includes(addOn.id)}
              disabled={disabled}
              onChange={(on) => set({ addOnIds: toggled(fields.addOnIds, addOn.id, on) })}
            />
          ))
        )}
      </fieldset>

      <fieldset disabled={disabled} className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">
          <Trans>Merchandise offered with it</Trans>
        </legend>
        {items.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no merchandise yet.</Trans>
          </p>
        ) : (
          items.map((item) => (
            <CheckboxField
              key={item.id}
              label={item.name}
              checked={fields.merchandiseItemIds.includes(item.id)}
              disabled={disabled}
              onChange={(on) =>
                set({ merchandiseItemIds: toggled(fields.merchandiseItemIds, item.id, on) })
              }
            />
          ))
        )}
      </fieldset>

      {!disabled && (
        <div>
          <Button type="submit" disabled={pending}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  )
}
