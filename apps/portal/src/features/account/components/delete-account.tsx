import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button, ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { GoogleButton, signInWithPassword } from '../../auth'
import { deleteAccountOptions, forgetSession } from '../api/account'
import { deletionRefusal } from '../model/deletion'
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

/**
 * Account deletion (PLAN.md 9): the user confirms it is them — the password again, or Google
 * again — and `DELETE /me` follows within the 5 minutes the API allows (PLAN.md 7.4).
 */
export function DeleteAccount({ email, methods }: { email: string; methods: SignInMethods }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const backFromGoogle = params.get(CONFIRM_DELETION_PARAM) === CONFIRM_DELETION_VALUE
  const [open, setOpen] = useState(backFromGoogle)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const remove = useMutation(deleteAccountOptions())

  const deleteNow = async () => {
    try {
      await remove.mutateAsync({})
    } catch (failure) {
      setError(failure)
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

  if (!open) {
    return (
      <Button variant="danger" className="self-start" onClick={() => setOpen(true)}>
        <Trans>Delete my account</Trans>
      </Button>
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
      {backFromGoogle ? (
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
            <GoogleButton returnTo={CONFIRM_DELETION_PATH}>
              <Trans>Confirm with Google</Trans>
            </GoogleButton>
          )}
        </>
      )}
      <Button variant="secondary" className="self-start" onClick={() => setOpen(false)}>
        <Trans>Keep my account</Trans>
      </Button>
    </div>
  )
}
