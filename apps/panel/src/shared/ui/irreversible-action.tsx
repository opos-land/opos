import { Trans } from '@lingui/react/macro'
import { type ReactNode, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog'
import { Button } from './button'

/**
 * The button of an action that cannot be undone (docs/ARCHITECTURE.md, Frontends). It opens a
 * modal that says what the action does and that it cannot be undone, and only the modal's own
 * button acts. The modal stays while the action runs and closes once it settles; a failure is told
 * by the action itself, as the query client does for a mutation.
 */
export function IrreversibleAction({
  label,
  title,
  action,
  children,
  onConfirm,
  disabled,
  className,
}: {
  /** The button that opens the modal. */
  label: ReactNode
  /** The modal's question, naming what goes. */
  title: ReactNode
  /** The modal's button that acts. */
  action: ReactNode
  /** What the action does; the modal adds that it cannot be undone. */
  children: ReactNode
  onConfirm: () => Promise<unknown>
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const confirm = async () => {
    setPending(true)
    try {
      await onConfirm()
    } catch {
      // Told by the action's own notification.
    } finally {
      setPending(false)
      setOpen(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger
        disabled={disabled}
        className={className}
        render={<Button variant="destructive" />}
      >
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {children}{' '}
            <Trans comment="Follows what the action does, in the modal that confirms it; 'This action' is the action confirmed.">
              This action cannot be undone.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => void confirm()}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
