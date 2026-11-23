import { useLingui } from '@lingui/react/macro'
import { type CreateMerchandiseItem } from '@opos/contract'
import { type ReactNode, useState } from 'react'
import { Button, CheckboxField, FieldSet, FormField, Input, Textarea } from '../../../shared/ui'
import { useMoney } from '../hooks/use-money'
import { itemBody, type ItemFields, type ItemProblem } from '../model/merchandise'

/**
 * The fields of a merchandise item, for a new one and for one that exists: what it is called and
 * costs, the most a single order may take of it, and whether its pictures are illustrative. It is
 * picked up at the edition: the form has no field for shipping.
 */
export function ItemForm({
  initial,
  disabled = false,
  pending,
  submitLabel,
  onSubmit,
}: {
  initial: ItemFields
  disabled?: boolean
  pending: boolean
  submitLabel: ReactNode
  onSubmit: (body: Required<Omit<CreateMerchandiseItem, 'axes'>>) => void
}) {
  const { t } = useLingui()
  const money = useMoney()
  const [fields, setFields] = useState(initial)
  const [problems, setProblems] = useState<ItemProblem[]>([])
  const set = (changes: Partial<ItemFields>) => setFields((held) => ({ ...held, ...changes }))
  const wrong = (problem: ItemProblem) => problems.includes(problem)
  const currency = money.currency

  return (
    <form
      noValidate
      className="flex max-w-lg flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const read = itemBody(fields, money.parse)
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
        <FormField label={t`Description`} hint={t`Shown to the buyer, up to 5000 characters.`}>
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              maxLength={5000}
              value={fields.description}
              onChange={(event) => set({ description: event.target.value })}
            />
          )}
        </FormField>
        <FormField
          label={t`Price (${currency})`}
          hint={t`The gross amount, the same for every variant.`}
          error={wrong('price') && t`Enter an amount, such as 40 or 40.50.`}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              value={fields.price}
              onChange={(event) => set({ price: event.target.value })}
            />
          )}
        </FormField>
        <FormField
          label={t`Most in a single order`}
          hint={t`How many of this item one order may take, over all its variants: from 1 to 100.`}
          error={wrong('perOrderLimit') && t`Enter a whole number from 1 to 100.`}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              value={fields.perOrderLimit}
              onChange={(event) => set({ perOrderLimit: event.target.value })}
            />
          )}
        </FormField>
        <CheckboxField
          label={t`The pictures are illustrative`}
          hint={t`The shop says beside the pictures that the item may look different.`}
          checked={fields.picturesIllustrative}
          disabled={disabled}
          onChange={(on) => set({ picturesIllustrative: on })}
        />
      </FieldSet>
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
