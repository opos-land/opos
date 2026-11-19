import { Trans, useLingui } from '@lingui/react/macro'
import { type CreateCustomField } from '@opos/contract'
import { type ReactNode, useState } from 'react'
import { Button, FormField, Input, NativeSelect, NativeSelectOption } from '../../../shared/ui'

/**
 * The fields of a custom field, for a new one and for one changed in place: what it asks a ticket
 * holder for, and whether an answer is required. An answer is a short text.
 */
export function CustomFieldForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CreateCustomField
  pending: boolean
  submitLabel: ReactNode
  onSubmit: (body: CreateCustomField) => void
  onCancel?: () => void
}) {
  const { t } = useLingui()
  const [label, setLabel] = useState(initial.label)
  const [isRequired, setRequired] = useState(initial.isRequired)
  const trimmed = label.trim()

  return (
    <form
      noValidate
      className="flex max-w-lg flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (trimmed) onSubmit({ label: trimmed, isRequired })
      }}
    >
      <FormField
        label={t`Question`}
        hint={t`What the checkout asks the ticket holder, such as “City you travel from”. The answer is a text of up to 200 characters.`}
      >
        {(control) => (
          <Input
            {...control}
            value={label}
            maxLength={100}
            onChange={(event) => setLabel(event.target.value)}
          />
        )}
      </FormField>
      <FormField label={t`Answer`}>
        {(control) => (
          <NativeSelect
            {...control}
            value={isRequired ? 'required' : 'optional'}
            onChange={(event) => setRequired(event.target.value === 'required')}
          >
            <NativeSelectOption value="required">
              {t`Required: the buyer must answer to order`}
            </NativeSelectOption>
            <NativeSelectOption value="optional">
              {t`Optional: the buyer can order without answering`}
            </NativeSelectOption>
          </NativeSelect>
        )}
      </FormField>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!trimmed || pending}>
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
