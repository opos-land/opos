import { useLingui } from '@lingui/react/macro'
import { TAKEDOWN_REASONS, type TakedownReason } from '@opos/contract'
import { reportReasonNames } from '@opos/i18n/profiles'
import { FormField, NativeSelect, NativeSelectOption } from '../../../shared/ui'

/**
 * The reason of a takedown or of a cleared name: one of the reasons a rule of the platform's
 * terms stands behind, so never "another one" (docs/specs/0016-public-profile.md, T3).
 */
export function ReasonField({
  value,
  onChange,
}: {
  value: TakedownReason
  onChange: (reason: TakedownReason) => void
}) {
  const { t, i18n } = useLingui()
  return (
    <FormField
      label={t`Reason`}
      hint={t`The email to the account names the rule of the terms behind it.`}
    >
      {(control) => (
        <NativeSelect
          {...control}
          value={value}
          onChange={(event) => onChange(event.target.value as TakedownReason)}
        >
          {TAKEDOWN_REASONS.map((reason) => (
            <NativeSelectOption key={reason} value={reason}>
              {i18n._(reportReasonNames[reason]!)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </FormField>
  )
}
