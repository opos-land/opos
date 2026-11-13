import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AdminTenant } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { useNavigate } from 'react-router'
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
  Input,
} from '../../../shared/ui'
import { adminKey, deleteConventionOptions } from '../api/conventions'

/**
 * The deletion of a suspended convention, asked in a modal that names the convention, says what
 * goes and that it cannot be undone, and acts only once its address is typed in: the one action
 * that asks for more than a press, since no other takes away as much
 * (docs/adr/0031-suspend-a-tenant-before-deleting-it.md). The API takes it only on a sign-in of
 * the last 5 minutes; an older one leads back to sign-in (query-client.ts), and the admin
 * repeats the deletion afterwards.
 */
export function DeleteConvention({ convention }: { convention: AdminTenant }) {
  const { t } = useLingui()
  const form = useId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const name = convention.name
  const address = convention.slug
  const remove = useMutation({
    ...deleteConventionOptions(),
    meta: { success: msg`The convention ${name} is deleted.` },
    onSuccess: async () => {
      // The list first: the page of a convention that is gone would answer "not found".
      await navigate('/', { replace: true })
      await queryClient.invalidateQueries({ queryKey: adminKey() })
    },
  })
  const matches = typed.trim() === address

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    if (!matches) return
    try {
      await remove.mutateAsync({ params: { tenantId: convention.id } })
    } catch {
      // Told by the write's own notification.
      setOpen(false)
    }
  }

  const change = (next: boolean) => {
    if (remove.isPending) return
    setOpen(next)
    setTyped('')
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trans>Delete the convention</Trans>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Delete the convention {name}?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              Everything the convention owns goes with it: its team, editions, programme and likes.
              The accounts of its organizers and attendees stay. Its address is never given to
              another convention.
            </Trans>{' '}
            <Trans comment="Follows what the action does, in the modal that confirms it; 'This action' is the action confirmed.">
              This action cannot be undone.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form id={form} onSubmit={(event) => void confirm(event)}>
          <FormField label={t`Type the address of the convention to confirm: ${address}`}>
            {(control) => (
              <Input
                {...control}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
          </FormField>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            type="submit"
            form={form}
            variant="destructive"
            disabled={!matches || remove.isPending}
          >
            <Trans>Delete for good</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
