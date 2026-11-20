import { Trans, useLingui } from '@lingui/react/macro'
import { ADD_ON_KINDS, type AddOnKind, type CreateAddOn } from '@opos/contract'
import { type ReactNode, useState } from 'react'
import {
  Button,
  FormField,
  Input,
  NativeSelect,
  NativeSelectOption,
  Textarea,
} from '../../../shared/ui'
import { useMoney } from '../hooks/use-money'
import { addOnBody, type AddOnFields, type AddOnProblem } from '../model/add-on-form'

/**
 * The fields of an add-on, for a new one and for one changed in place: what it is called and
 * costs, and what limits it. A headcount-only add-on reserves no place, which the form says where
 * the kind is chosen.
 */
export function AddOnForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: AddOnFields
  pending: boolean
  submitLabel: ReactNode
  onSubmit: (body: Required<CreateAddOn>) => void
  onCancel?: () => void
}) {
  const { t } = useLingui()
  const money = useMoney()
  const [fields, setFields] = useState(initial)
  const [problems, setProblems] = useState<AddOnProblem[]>([])
  const set = (changes: Partial<AddOnFields>) => setFields((held) => ({ ...held, ...changes }))
  const wrong = (problem: AddOnProblem) => problems.includes(problem)
  const currency = money.currency
  const kinds: Record<AddOnKind, string> = {
    unlimited: t`No limit: anyone may take it`,
    limited: t`Limited: a set number of places`,
    headcount: t`Headcount only: it counts interest and reserves no place`,
  }

  return (
    <form
      noValidate
      className="flex max-w-lg flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const read = addOnBody(fields, money.parse)
        setProblems('problems' in read ? read.problems : [])
        if ('body' in read) onSubmit(read.body)
      }}
    >
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
      <FormField label={t`Description`} hint={t`Shown to the buyer, up to 1000 characters.`}>
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            maxLength={1000}
            value={fields.description}
            onChange={(event) => set({ description: event.target.value })}
          />
        )}
      </FormField>
      <FormField
        label={t`Price (${currency})`}
        hint={t`The gross amount. Enter 0 for a free add-on.`}
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
      <FormField label={t`Limit`}>
        {(control) => (
          <NativeSelect
            {...control}
            value={fields.kind}
            onChange={(event) => set({ kind: event.target.value as AddOnKind })}
          >
            {ADD_ON_KINDS.map((kind) => (
              <NativeSelectOption key={kind} value={kind}>
                {kinds[kind]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
      {fields.kind === 'limited' && (
        <>
          <FormField
            label={t`Number of places`}
            error={wrong('capacity') && t`Enter a whole number of places.`}
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
          <FormField
            label={t`Show the places left when fewer than`}
            hint={t`The shop shows how many places are left only once fewer than this many remain. Leave it empty to never show them.`}
            error={wrong('threshold') && t`Enter a whole number from 1, or leave it empty.`}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                value={fields.threshold}
                onChange={(event) => set({ threshold: event.target.value })}
              />
            )}
          </FormField>
        </>
      )}
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
