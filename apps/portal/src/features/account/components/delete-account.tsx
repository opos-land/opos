import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button, ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { GoogleButton, signInWithPassword } from '../../auth'
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

/** The landing page reads this from the navigation state and says the account is gone. */
export interface AccountDeletedState {
  accountDeleted: true
}

function LastHeadRefusal() {
  return (
    <div role="alert" className="rounded-box border-danger text-danger border px-3 py-2 text-sm">
      <p>
        <Trans>
          You are the last head organizer of a convention, and a convention must keep at least one.
          In the organizer panel, make another member of that convention’s team a head organizer,
          then delete your account.
        </Trans>
      </p>
    </div>
  )
}

function OtherAccountRefusal({ email }: { email: string }) {
  return (
    <div role="alert" className="rounded-box border-danger text-danger border px-3 py-2 text-sm">
      <p>
        <Trans>
          Google signed you in to a different account, {email}, so nothing was deleted. To delete
          the account you started from, sign in to it and confirm again.
        </Trans>
      </p>
    </div>
  )
}

/**
 * Account deletion (PLAN.md 9): the user confirms it is them — the password again, or Google
 * again — and `DELETE /me` follows within the 5 minutes the API allows (PLAN.md 7.4). A return from
 * Google offers the deletion only to the account that left for it.
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
  const remove = useMutation(deleteAccountOptions())

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
      setError(failure)
      // A sign-in older than the API allows: confirm again with the password or Google.
      if (deletionRefusal(failure) === 'reauthenticate') setGoogleReturn('none')
      return
    }
    const state: AccountDeletedState = { accountDeleted: true }
    await navigate('/', { replace: true, state })
    await forgetSession()
  }

  const confirmWithPassword = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setPending(true)
    const failure = await signInWithPassword({ email, password })
    if (failure) setError(failure)
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
        <Button variant="danger" className="self-start" onClick={start}>
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
            <Trans>You signed in with Google again. Delete the account within 5 minutes.</Trans>
          </p>
          <Button
            variant="danger"
            className="self-start"
            pending={pending}
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
              <Field label={t`Your password`} hint={t`Enter it again to confirm it is you.`}>
                {(control) => (
                  <input
                    {...control}
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={inputClass}
                  />
                )}
              </Field>
              <Button type="submit" variant="danger" className="self-start" pending={pending}>
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
      <Button variant="secondary" className="self-start" onClick={keep}>
        <Trans>Keep my account</Trans>
      </Button>
    </div>
  )
}
