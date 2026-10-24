import { type ReactNode, useId } from 'react'

interface FieldProps {
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

/** A label, the control and its hint and error, wired together for assistive technology. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': described.length ? described.join(' ') : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p id={`${id}-hint`} className="text-muted text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

// 16 px text: a phone browser zooms into a field with smaller text.
export const inputClass =
  'min-h-11 rounded-box border border-line bg-surface px-3 py-2 text-base disabled:bg-paper disabled:text-muted aria-invalid:border-danger'
