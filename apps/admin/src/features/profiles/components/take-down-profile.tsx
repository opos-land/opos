import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
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
  FormField,
  Textarea,
} from '../../../shared/ui'
import { adminKey, takeDownProfileOptions } from '../api/profiles'
import { ReasonField } from './reason-field'

const MAX_NOTE = 500

/**
 * The takedown of a profile, asked in a modal that takes its reason and a sentence for the
 * account: restoring lifts the takedown, but no screen brings back the avatar that goes with it
 * (docs/specs/0016-public-profile.md, T3-T5 and T13).
 */
export function TakeDownProfile({ profile, name }: { profile: AdminProfile; name: string }) {
  const { t } = useLingui()
  const form = useId()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<TakedownReason>('identity')
  const [note, setNote] = useState('')
  const sentence = note.trim()
  const takeDown = useMutation({
    ...takeDownProfileOptions(),
    meta: {
      success: ({ emailSent }: ModeratedProfile) =>
        emailSent === false
          ? msg`The profile is taken down, but the email to the account could not be sent. Tell the person yourself.`
          : emailSent
            ? msg`The profile is taken down, and the account got an email that says why.`
            : msg`The profile was taken down already.`,
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey() }),
  })

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    if (sentence.length > MAX_NOTE) return
    try {
      await takeDown.mutateAsync({
        params: { accountId: profile.accountId },
        body: { reason, ...(sentence ? { note: sentence } : {}) },
      })
    } catch {
      // Told by the write's own notification.
    }
    setOpen(false)
  }

  const change = (next: boolean) => {
    if (takeDown.isPending) return
    setOpen(next)
    setNote('')
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trans>Take the profile down</Trans>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Take the profile of {name} down?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              The profile stops being public at once and cannot be published until you restore it.
              Its avatar is removed and its open reports are closed. The account gets an email that
              says why, and who reported the profile is told.
            </Trans>{' '}
            <Trans>Restoring does not bring the avatar back.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form id={form} onSubmit={(event) => void confirm(event)} className="flex flex-col gap-4">
          <ReasonField value={reason} onChange={setReason} />
          <FormField
            label={t`A sentence for the account (optional)`}
            hint={t`It goes into the email as you write it.`}
            error={sentence.length > MAX_NOTE ? t`Enter up to ${MAX_NOTE} characters.` : undefined}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
          </FormField>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={takeDown.isPending}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            type="submit"
            form={form}
            variant="destructive"
            disabled={takeDown.isPending || sentence.length > MAX_NOTE}
          >
            <Trans>Take the profile down</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
