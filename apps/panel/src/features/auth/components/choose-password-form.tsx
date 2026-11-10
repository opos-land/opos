import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { newPasswordSchema } from '@opos/contract'
import { z } from 'zod'
import { errorCode } from '../../../shared/lib/errors'
import {
  Alert,
  AlertTitle,
  Button,
  ErrorMessage,
  FormField,
  Input,
  Notice,
} from '../../../shared/ui'
import { sendPasswordLink, setPassword } from '../api/auth'
import { INVITATION_PATH } from '../model/auth-return'

const schema = z
  .object({ password: newPasswordSchema.min(8), repeat: z.string() })
  .refine((v) => v.password === v.repeat, { path: ['repeat'] })

/**
 * The password of an account whose address has just been confirmed. Saving
 * it ends every other session of the account. A sign-in older than 5 minutes cannot change the
 * password (7.4); the form then offers a new link by email instead. `auth.same_password` on a
 * retry of the password that failed before counts as saved.
 */
export function ChoosePasswordForm({
  email,
  returnTo,
  onDone,
}: {
  email: string
  /** The page the new link returns to once it is opened. */
  returnTo: string
  onDone: () => void
}) {
  const { t } = useLingui()
  const [error, setError] = useState<unknown>(null)
  const [linkSent, setLinkSent] = useState(false)
  /** The password of an attempt that failed for another reason than being the current one. */
  const [attempted, setAttempted] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', repeat: '' },
  })
  const { errors, isSubmitting } = form.formState
  const tooOld = errorCode(error) === 'session.reauthentication-required'

  const submit = form.handleSubmit(async ({ password }) => {
    setError(null)
    const failure = await setPassword(password)
    if (failure) {
      if (errorCode(failure) !== 'auth.same_password') {
        // The API saves the password, then ends the other sessions: a lost answer or a failed
        // second step leaves it saved, and the retry meets the current password.
        setAttempted(password)
        return setError(failure)
      }
      if (attempted !== password) return setError(failure)
    }
    onDone()
  })

  const sendLink = async () => {
    setError(null)
    const failure = await sendPasswordLink(email, returnTo)
    if (failure) setError(failure)
    else setLinkSent(true)
  }

  if (linkSent) {
    return (
      <Notice>
        <Trans>We sent a new link to {email}. Open it to choose your password.</Trans>
      </Notice>
    )
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-3">
      <p className="text-sm">
        <Trans>Your address {email} is confirmed. Choose the password you will sign in with.</Trans>
      </p>
      <FormField
        label={t`New password`}
        hint={t`At least 8 characters.`}
        error={
          errors.password &&
          (errors.password.type === 'too_small'
            ? t`Use at least 8 characters.`
            : t`Use at most 72 bytes; some characters count for more than one.`)
        }
      >
        {(control) => (
          <Input
            {...control}
            {...form.register('password')}
            type="password"
            autoComplete="new-password"
          />
        )}
      </FormField>
      <FormField label={t`Repeat the password`} error={errors.repeat && t`The passwords differ.`}>
        {(control) => (
          <Input
            {...control}
            {...form.register('repeat')}
            type="password"
            autoComplete="new-password"
          />
        )}
      </FormField>
      {tooOld ? (
        <>
          <Alert variant="destructive">
            <AlertTitle>
              <Trans>Too much time has passed since you opened the link. Ask for a new one.</Trans>
            </AlertTitle>
          </Alert>
          <Button variant="outline" onClick={() => void sendLink()}>
            <Trans>Send a new link</Trans>
          </Button>
        </>
      ) : (
        <ErrorMessage error={error} />
      )}
      <Button disabled={isSubmitting} type="submit">
        {returnTo === INVITATION_PATH ? (
          <Trans>Save the password and join the team</Trans>
        ) : (
          <Trans>Save the password</Trans>
        )}
      </Button>
    </form>
  )
}
