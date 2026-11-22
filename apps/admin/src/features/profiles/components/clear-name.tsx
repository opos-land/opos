import { msg } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import { type AdminProfile, type ModeratedProfile, type TakedownReason } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
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
  Button,
} from '../../../shared/ui'
import { adminKey, clearAccountNameOptions } from '../api/profiles'
import { ReasonField } from './reason-field'

/**
 * The clearing of an account's name, asked in a modal that takes its reason: the three parts go
 * and no screen brings them back, though the account may enter a name again
 * (docs/specs/0016-public-profile.md, T10 and T13).
 */
export function ClearName({ profile, name }: { profile: AdminProfile; name: string }) {
  const form = useId()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<TakedownReason>('identity')
  const clear = useMutation({
    ...clearAccountNameOptions(),
    meta: {
      success: ({ emailSent }: ModeratedProfile) =>
        emailSent === false
          ? msg`The name is cleared, but the email to the account could not be sent. Tell the person yourself.`
          : emailSent
            ? msg`The name is cleared, and the account got an email that says why.`
            : msg`The account had no name to clear.`,
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey() }),
  })

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await clear.mutateAsync({ params: { accountId: profile.accountId }, body: { reason } })
    } catch {
      // Told by the write's own notification.
    }
    setOpen(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !clear.isPending && setOpen(next)}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trans>Clear the name</Trans>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Clear the name of {name}?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              The first name, the nickname and the last name of the account go, and everyone sees it
              as “Anon”, in the programme too. The account gets an email that says why, and may
              enter a name again.
            </Trans>{' '}
            <Trans comment="Follows what the action does, in the modal that confirms it; 'This action' is the action confirmed.">
              This action cannot be undone.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form id={form} onSubmit={(event) => void confirm(event)}>
          <ReasonField value={reason} onChange={setReason} />
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={clear.isPending}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            type="submit"
            form={form}
            variant="destructive"
            disabled={clear.isPending}
          >
            <Trans>Clear the name</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
