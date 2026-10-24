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
      className={`rounded-box border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
