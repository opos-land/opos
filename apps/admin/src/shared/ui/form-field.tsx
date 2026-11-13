import { type ReactNode, useId } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from './field'

interface FormFieldProps {
  label: ReactNode
  hint?: ReactNode
  /** A translated message for an invalid value. */
  error?: ReactNode
  children: (control: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }) => ReactNode
}

/** A field of a form: its label, the control and its hint and error, wired together for assistive technology. */
export function FormField({ label, hint, error, children }: FormFieldProps) {
  const id = useId()
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean)
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children({
        id,
        'aria-describedby': described.length ? described.join(' ') : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
      {/* The form's own alert announces a failure; the control reads its error. */}
      {error && (
        <FieldError id={`${id}-error`} role={undefined}>
          {error}
        </FieldError>
      )}
    </Field>
  )
}
