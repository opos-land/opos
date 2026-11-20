import { type ReactNode, useId } from 'react'
import { Checkbox } from './checkbox'
import { FieldDescription } from './field'
import { Label } from './label'

/**
 * A checkbox with its visible label, and a hint when it needs one, wired together for assistive
 * technology: the box is named by the label and described by the hint.
 */
export function CheckboxField({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          aria-labelledby={`${id}-label`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => onChange(next)}
        />
        <Label id={`${id}-label`} htmlFor={id}>
          {label}
        </Label>
      </div>
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
    </div>
  )
}
