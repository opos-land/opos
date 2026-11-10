import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { errorCode } from '../../../shared/lib/errors'
import { notifySuccess } from '../../../shared/lib/notify'
import { Alert, AlertDescription, Button, ErrorMessage, FormField, Input } from '../../../shared/ui'
import { GoogleButton, signInWithPassword, withMfaReturn } from '../../auth'
import { deleteAccountOptions, forgetSession } from '../api/account'
import { deletionRefusal } from '../model/deletion'
import {
  forgetDeletionConfirmation,
  googleReturn as readGoogleReturn,
  type GoogleReturn,
  rememberDeletionConfirmation,
  startedDeletionConfirmation,
} from '../model/deletion-confirmation'
import {
  CONFIRM_DELETION_PARAM,
  CONFIRM_DELETION_PATH,
  CONFIRM_DELETION_VALUE,
  type SignInMethods,
} from '../model/sign-in-methods'

function LastHeadRefusal() {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <Trans>
          You are the last head organizer of a convention, and a convention must keep at least one.
          In the organizer panel, make another member of that convention’s team a head organizer,
          then delete your account.
        </Trans>
      </AlertDescription>
    </Alert>
  )
}

function OtherAccountRefusal({ email }: { email: string }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <Trans>
          Google signed you in to a different account, {email}, so nothing was deleted. To delete
          the account you started from, sign in to it and confirm again.
        </Trans>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Account deletion: the user confirms it is them — the password again, or Google
 * again — and `DELETE /me` follows within the 5 minutes the API allows. A return from
 * Google, or from the code screen of an account with two-factor authentication, offers the
 * deletion only to the account that left.
 */
export function DeleteAccount({
  userId,
  email,
  methods,
}: {
  userId: string
  email: string
  methods: SignInMethods
}) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [googleReturn, setGoogleReturn] = useState<GoogleReturn>(() =>
    params.get(CONFIRM_DELETION_PARAM) === CONFIRM_DELETION_VALUE
      ? readGoogleReturn(startedDeletionConfirmation(), userId)
      : 'none',
  )
  const [open, setOpen] = useState(googleReturn === 'confirmed')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const remove = useMutation({
    ...deleteAccountOptions(),
    // Told below, once the session is gone: an account change closes the account's notifications.
    meta: { success: false },
  })

  // A Google return is used once: a reload or a copied link confirms nothing.
  useEffect(() => {
    forgetDeletionConfirmation()
    if (!params.has(CONFIRM_DELETION_PARAM)) return
    setParams(
      (current) => {
        current.delete(CONFIRM_DELETION_PARAM)
        return current
      },
      { replace: true },
    )
  }, [params, setParams])

  const deleteNow = async () => {
    try {
      await remove.mutateAsync({})
    } catch (failure) {
      // The refusal is a notification (query-client.ts); the last head is told what to do first.
      if (deletionRefusal(failure) === 'last-head') setError(failure)
      // A sign-in older than the API allows: confirm again with the password or Google.
      if (deletionRefusal(failure) === 'reauthenticate') setGoogleReturn('none')
      return
    }
    // Rendered before the session is forgotten: the account page, which needs a session, must be
    // gone by then, or it would send the visitor to sign-in instead of the home page. `flushSync`
    // needs the `RouterProvider` of `react-router/dom`, which main.tsx mounts.
    await navigate('/', { replace: true, flushSync: true })
    forgetSession()
    notifySuccess({ success: msg`Your account has been deleted.` }, null)
  }

  const confirmWithPassword = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setPending(true)
    const failure = await withMfaReturn(CONFIRM_DELETION_PATH, () =>
      signInWithPassword({ email, password }),
    )
    if (errorCode(failure) === 'session.mfa-required') {
      // The code screen is next and returns here, as a Google return does.
      rememberDeletionConfirmation(userId)
    } else if (failure) setError(failure)
    else await deleteNow()
    setPending(false)
  }

  const deleteAfterGoogle = async () => {
    setError(null)
    setPending(true)
    await deleteNow()
    setPending(false)
  }

  const start = () => {
    setGoogleReturn('none')
    setOpen(true)
  }

  const keep = () => {
    setGoogleReturn('none')
    setError(null)
    setOpen(false)
  }

  if (!open) {
    return (
      <>
        {googleReturn === 'other-account' && <OtherAccountRefusal email={email} />}
        <Button variant="destructive" className="self-start" onClick={start}>
          <Trans>Delete my account</Trans>
        </Button>
      </>
    )
  }

  const refusal = error ? deletionRefusal(error) : null

  return (
    <div className="flex flex-col gap-4">
      <p>
        <Trans>
          Deleting your account cannot be undone. Your likes, reviews, edition sign-ups and
          memberships in convention teams go with it. Orders placed with your address stay with the
          conventions as their sales records.
        </Trans>
      </p>
      {refusal === 'last-head' ? <LastHeadRefusal /> : <ErrorMessage error={error} />}
      {googleReturn === 'confirmed' ? (
        <>
          <p className="text-sm">
            <Trans>You confirmed it is you again. Delete the account within 5 minutes.</Trans>
          </p>
          <Button
            disabled={pending}
            variant="destructive"
            className="self-start"

            onClick={() => void deleteAfterGoogle()}
          >
            <Trans>Delete my account</Trans>
          </Button>
        </>
      ) : (
        <>
          {methods.password && (
            <form
              onSubmit={(event) => void confirmWithPassword(event)}
              className="flex flex-col gap-4"
            >
              <FormField label={t`Your password`} hint={t`Enter it again to confirm it is you.`}>
                {(control) => (
                  <Input
                    {...control}
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                )}
              </FormField>
              <Button disabled={pending} type="submit" variant="destructive" className="self-start">
                <Trans>Delete my account</Trans>
              </Button>
            </form>
          )}
          {methods.google && (
            <GoogleButton
              returnTo={CONFIRM_DELETION_PATH}
              onLeave={() => rememberDeletionConfirmation(userId)}
            >
              <Trans>Confirm with Google</Trans>
            </GoogleButton>
          )}
        </>
      )}
      <Button variant="outline" className="self-start" onClick={keep}>
        <Trans>Keep my account</Trans>
      </Button>
    </div>
  )
}
