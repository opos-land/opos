import { type ButtonHTMLAttributes } from 'react'

const variants = {
  primary: 'bg-accent text-accent-ink border-accent hover:opacity-90',
  secondary: 'bg-surface text-ink border-line hover:border-ink',
  danger: 'bg-surface text-danger border-danger hover:bg-danger hover:text-accent-ink',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  /** Disables the button and marks it busy while its action runs. */
  pending?: boolean
}

/** A button sized for a finger first (PLAN.md 9): at least 44 px tall. */
export function Button({
  variant = 'primary',
  pending = false,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`rounded-box min-h-11 border px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
