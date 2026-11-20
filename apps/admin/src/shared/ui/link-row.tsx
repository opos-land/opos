import { cn } from 'cn'
import { type ComponentProps, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { TableRow } from './table'

/** The link of a `LinkRow`: no underline, since the whole row shows it; a ring when focused. */
export function RowLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        'rounded-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  )
}

/**
 * A table row that opens `to` from anywhere in it, for a pointer; a link inside the row stays the
 * way a keyboard and a screen reader reach the same page. Without `to` the row is inert and does
 * not light up under the pointer.
 */
export function LinkRow({
  to,
  className,
  ...props
}: ComponentProps<typeof TableRow> & { to: string | undefined }) {
  const navigate = useNavigate()
  if (!to) return <TableRow className={cn('hover:bg-transparent', className)} {...props} />

  const open = (event: MouseEvent<HTMLTableRowElement>) => {
    // A control inside the row handles its own click; a click that ends a selection opens nothing.
    const target = event.target as Element
    if (target.closest('a, button, input, select, textarea, label')) return
    if (window.getSelection()?.toString()) return
    if (event.metaKey || event.ctrlKey) window.open(to, '_blank', 'noopener')
    else void navigate(to)
  }
  return <TableRow className={cn('cursor-pointer', className)} onClick={open} {...props} />
}
