import { Trans, useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useLocation } from 'react-router'
import { errorCode } from '../../../shared/lib/errors'
import { Button, ErrorMessage, Field, inputClass, Notice } from '../../../shared/ui'
import {
  disableTwoFactor,
  enableTwoFactor,
  enrollTwoFactor,
  refreshAccount,
} from '../api/two-factor'
import { type SignInMethods } from '../model/sign-in-methods'
import { ReauthenticateForm } from './reauthenticate-form'

const SIX_DIGITS = /^\d{6}$/

type Action = 'enroll' | 'disable'

/**
 * What the card shows besides the on or off state. The secret, the QR code and the recovery codes
 * live in this state alone: they are never stored, and go with the view (PLAN.md 7.12).
 */
type View =
  | { step: 'idle' }
  | { step: 'enrolling'; factorId: string; qrCode: string; secret: string }
  | { step: 'codes'; codes: string[] }
  | { step: 'reauthenticate'; action: Action; error: unknown }

function Enrolling({
  qrCode,
  secret,
  onEnable,
  onCancel,
}: {
  qrCode: string
  secret: string
  onEnable: (code: string) => Promise<unknown>
  onCancel: () => void
}) {
  const { t } = useLingui()
  const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const wrong = !SIX_DIGITS.test(code.trim())
    setInvalid(wrong)
    if (wrong) return
    setPending(true)
    const failure = await onEnable(code.trim())
    setPending(false)
    if (failure) setError(failure)
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <p className="text-sm">
        <Trans>
          Scan the QR code with an authenticator app, or type the secret into it. Then enter the
          six-digit code the app shows.
        </Trans>
      </p>
      <img
        src={qrCode}
        alt={t`QR code for your authenticator app`}
        className="size-48 max-w-full self-center bg-white"
      />
      <p className="text-sm">
        <Trans>Secret</Trans>: <code className="font-mono break-all">{secret}</code>
      </p>
      <Field
        label={t`Code from the app`}
        error={invalid && t`Enter the six digits from your authenticator app.`}
      >
        {(control) => (
          <input
            {...control}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      <ErrorMessage error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          <Trans>Turn on</Trans>
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          <Trans>Cancel</Trans>
        </Button>
      </div>
    </form>
  )
}

function RecoveryCodes({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <Trans>
          Save these ten recovery codes somewhere safe. Each works once, in place of a code from the
          app, and using one turns two-factor authentication off. They are shown only now.
        </Trans>
      </p>
      <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {codes.map((code) => (
          <li
            key={code}
            className="rounded-box border-line border px-3 py-2 font-mono text-base break-all"
          >
            {code}
          </li>
        ))}
      </ul>
      <Button className="self-start" onClick={onSaved}>
        <Trans>I have saved my codes</Trans>
      </Button>
    </div>
  )
}

/**
 * The two-factor card in the account menu (PLAN.md 7.12): off, with the way to turn it on (the QR code
 * and the secret, then the recovery codes once, until the person confirms they saved them); on,
 * with the way to turn it off. Turning it on or off needs a sign-in from the last 5 minutes, which
 * the card asks for as the account's sign-in methods allow.
 */
export function TwoFactorCard({
  email,
  mfaEnabled,
  methods,
}: {
  email: string
  mfaEnabled: boolean
  methods: SignInMethods
}) {
  const queryClient = useQueryClient()
  const location = useLocation()
  const [view, setView] = useState<View>({ step: 'idle' })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [lostCodes, setLostCodes] = useState(false)

  // The card and `GET /me` agree: a failed refresh leaves what the card already shows.
  const refresh = () => refreshAccount(queryClient).catch(() => undefined)

  const run = async (action: Action) => {
    setError(null)
    setLostCodes(false)
    setPending(true)
    try {
      if (action === 'enroll') {
        const { factorId, qrCode, secret } = await enrollTwoFactor()
        setView({ step: 'enrolling', factorId, qrCode, secret })
      } else {
        await disableTwoFactor()
        setView({ step: 'idle' })
        await refresh()
      }
    } catch (failure) {
      if (errorCode(failure) === 'session.reauthentication-required') {
        setView({ step: 'reauthenticate', action, error: failure })
      } else {
        setError(failure)
        // The account already has 2FA on: what the card shows was out of date.
        if (errorCode(failure) === 'mfa.already-enabled') await refresh()
      }
    } finally {
      setPending(false)
    }
  }

  const enable = async (factorId: string, code: string): Promise<unknown> => {
    try {
      const { recoveryCodes } = await enableTwoFactor(factorId, code)
      setView({ step: 'codes', codes: recoveryCodes })
      await refresh()
      return null
    } catch (failure) {
      if (errorCode(failure) !== 'mfa.already-enabled') return failure
      // The factor is verified but a request racing this one replaced the codes (PLAN.md 7.12).
      setView({ step: 'idle' })
      setLostCodes(true)
      await refresh()
      return null
    }
  }

  if (view.step === 'codes') {
    return <RecoveryCodes codes={view.codes} onSaved={() => setView({ step: 'idle' })} />
  }

  if (view.step === 'enrolling') {
    const { factorId, qrCode, secret } = view
    return (
      <Enrolling
        qrCode={qrCode}
        secret={secret}
        onEnable={(code) => enable(factorId, code)}
        onCancel={() => setView({ step: 'idle' })}
      />
    )
  }

  if (view.step === 'reauthenticate') {
    const { action } = view
    return (
      <ReauthenticateForm
        email={email}
        methods={methods}
        returnTo={location.pathname + location.search}
        error={view.error}
        onConfirmed={() => {
          setView({ step: 'idle' })
          void run(action)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {lostCodes && (
        <Notice>
          <Trans>
            Two-factor authentication is on, but the recovery codes could not be shown. To get new
            ones, sign in with a code from your app, turn two-factor authentication off, and turn it
            on again.
          </Trans>
        </Notice>
      )}
      <ErrorMessage error={error} />
      {mfaEnabled ? (
        <>
          <p className="text-sm">
            <Trans>
              Two-factor authentication is on. You enter a code from your authenticator app each
              time you sign in.
            </Trans>
          </p>
          <Button
            variant="danger"
            className="self-start"
            pending={pending}
            onClick={() => void run('disable')}
          >
            <Trans>Turn off two-factor authentication</Trans>
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm">
            <Trans>
              Two-factor authentication is off. Turn it on to be asked for a code from an
              authenticator app each time you sign in.
            </Trans>
          </p>
          <Button className="self-start" pending={pending} onClick={() => void run('enroll')}>
            <Trans>Turn on two-factor authentication</Trans>
          </Button>
        </>
      )}
    </div>
  )
}
