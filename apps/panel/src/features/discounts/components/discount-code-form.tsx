import { Trans, useLingui } from '@lingui/react/macro'
import { type DiscountCode } from '@opos/contract'
import { type ReactNode, useState } from 'react'
import {
  Button,
  CheckboxField,
  FieldError,
  FormField,
  Input,
  NativeSelect,
  NativeSelectOption,
} from '../../../shared/ui'
import { useMoney } from '../../catalog'
import { useTenantTime } from '../../tenants'
import {
  type DiscountCodeBody,
  discountCodeBody,
  type DiscountCodeFields,
  type DiscountCodeProblem,
} from '../model/discount-code-form'

/** What an edition sells, as far as a code names it. */
export interface CodeCatalog {
  ticketTypes: readonly { id: string; name: string; discountsExcluded: boolean }[]
  addOns: readonly { id: string; name: string }[]
  items: readonly { id: string; name: string }[]
}

const toggled = (ids: string[], id: string, on: boolean) =>
  on ? [...ids.filter((own) => own !== id), id] : ids.filter((own) => own !== id)

/**
 * The fields of a discount code, for a new one and for one changed in place
 * (docs/specs/0008-discount-codes.md, D1-D4): its text, its value, what of the edition it applies
 * to, how many orders may use it and when. A ticket type excluded from discounts is not offered.
 */
export function DiscountCodeForm({
  initial,
  catalog,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: DiscountCodeFields
  catalog: CodeCatalog
  pending: boolean
  submitLabel: ReactNode
  onSubmit: (body: DiscountCodeBody) => void
  onCancel?: () => void
}) {
  const { t } = useLingui()
  const money = useMoney()
  const time = useTenantTime()
  const [fields, setFields] = useState(initial)
  const [problems, setProblems] = useState<DiscountCodeProblem[]>([])
  const set = (changes: Partial<DiscountCodeFields>) =>
    setFields((held) => ({ ...held, ...changes }))
  const wrong = (problem: DiscountCodeProblem) => problems.includes(problem)
  const currency = money.currency
  const zone = time.timeZone
  const kinds: Record<DiscountCode['kind'], string> = {
    percent: t`A percent of the price`,
    amount: t`An amount`,
  }
  const nothing = catalog.ticketTypes.length + catalog.addOns.length + catalog.items.length === 0

  return (
    <form
      noValidate
      className="flex max-w-lg flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const read = discountCodeBody(fields, { parse: money.parse, fromInput: time.fromInput })
        setProblems('problems' in read ? read.problems : [])
        if ('body' in read) onSubmit(read.body)
      }}
    >
      <FormField
        label={t`Code`}
        hint={t`What a buyer types at the Summary, in any case.`}
        error={wrong('code') && t`Enter 4 to 40 letters, digits and hyphens.`}
      >
        {(control) => (
          <Input
            {...control}
            value={fields.code}
            maxLength={40}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(event) => set({ code: event.target.value })}
          />
        )}
      </FormField>
      <FormField label={t`Kind`}>
        {(control) => (
          <NativeSelect
            {...control}
            value={fields.kind}
            onChange={(event) => set({ kind: event.target.value as DiscountCode['kind'] })}
          >
            {(['percent', 'amount'] as const).map((kind) => (
              <NativeSelectOption key={kind} value={kind}>
                {kinds[kind]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
      {fields.kind === 'percent' ? (
        <FormField
          label={t`Percent off`}
          hint={t`100 makes what the code applies to free: an order with nothing left to pay is paid at once.`}
          error={wrong('percent') && t`Enter a whole number from 1 to 100.`}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              value={fields.percent}
              onChange={(event) => set({ percent: event.target.value })}
            />
          )}
        </FormField>
      ) : (
        <FormField
          label={t`Amount off (${currency})`}
          hint={t`Taken off what the code applies to together, at most its price.`}
          error={wrong('amount') && t`Enter an amount above zero, such as 40 or 40.50.`}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              value={fields.amount}
              onChange={(event) => set({ amount: event.target.value })}
            />
          )}
        </FormField>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium">
          <Trans>What the code applies to</Trans>
        </legend>
        {nothing && (
          <p className="text-sm">
            <Trans>The edition sells nothing yet. Add a ticket type first.</Trans>
          </p>
        )}
        {catalog.ticketTypes.length > 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm">
              <Trans>Ticket types</Trans>
            </legend>
            {catalog.ticketTypes.map((type) => (
              <CheckboxField
                key={type.id}
                label={type.name}
                hint={type.discountsExcluded && t`Excluded from discounts on its page.`}
                disabled={type.discountsExcluded}
                checked={!type.discountsExcluded && fields.ticketTypeIds.includes(type.id)}
                onChange={(on) =>
                  set({ ticketTypeIds: toggled(fields.ticketTypeIds, type.id, on) })
                }
              />
            ))}
          </fieldset>
        )}
        {catalog.addOns.length > 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm">
              <Trans>Add-ons</Trans>
            </legend>
            {catalog.addOns.map((addOn) => (
              <CheckboxField
                key={addOn.id}
                label={addOn.name}
                checked={fields.addOnIds.includes(addOn.id)}
                onChange={(on) => set({ addOnIds: toggled(fields.addOnIds, addOn.id, on) })}
              />
            ))}
          </fieldset>
        )}
        {catalog.items.length > 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm">
              <Trans>Merchandise</Trans>
            </legend>
            {catalog.items.map((item) => (
              <CheckboxField
                key={item.id}
                label={item.name}
                checked={fields.itemIds.includes(item.id)}
                onChange={(on) => set({ itemIds: toggled(fields.itemIds, item.id, on) })}
              />
            ))}
          </fieldset>
        )}
        {wrong('appliesTo') && (
          <FieldError>
            <Trans>Choose at least one thing the code applies to.</Trans>
          </FieldError>
        )}
      </fieldset>

      <FormField
        label={t`Usage limit`}
        hint={t`How many orders may use the code. Leave it empty for no limit.`}
        error={wrong('usageLimit') && t`Enter a whole number from 1, or leave it empty.`}
      >
        {(control) => (
          <Input
            {...control}
            inputMode="numeric"
            value={fields.usageLimit}
            onChange={(event) => set({ usageLimit: event.target.value })}
          />
        )}
      </FormField>
      <FormField
        label={t`Valid from`}
        hint={t`In the convention's time zone, ${zone}.`}
        error={
          wrong('window') &&
          t`Enter when the code starts to be valid and when it stops, the end later.`
        }
      >
        {(control) => (
          <Input
            {...control}
            type="datetime-local"
            value={fields.validFrom}
            onChange={(event) => set({ validFrom: event.target.value })}
          />
        )}
      </FormField>
      <FormField label={t`Valid until`} hint={t`In the convention's time zone, ${zone}.`}>
        {(control) => (
          <Input
            {...control}
            type="datetime-local"
            value={fields.validUntil}
            onChange={(event) => set({ validUntil: event.target.value })}
          />
        )}
      </FormField>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            <Trans>Cancel</Trans>
          </Button>
        )}
      </div>
    </form>
  )
}
