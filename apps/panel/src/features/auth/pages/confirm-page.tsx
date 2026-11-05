import { Trans, useLingui } from '@lingui/react/macro'
import { verifySchema } from '@opos/contract'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { errorCode } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import { startSession, useSession } from '../../../shared/lib/session'
import { Button, ErrorMessage, LoadingView, Notice, UnavailableView } from '../../../shared/ui'
import { sendPasswordLink, verifyLink } from '../api/auth'
import { AuthLayout } from '../components/auth-layout'
import { ChoosePasswordForm } from '../components/choose-password-form'
import { EmailOnlyForm } from '../components/email-only-form'
import { authReturn, forgetAuthReturn } from '../model/auth-return'
import { mfaPath } from '../model/mfa-return'
import { loginPath } from '../model/redirect'

type EmailLink = NonNullable<ReturnType<typeof readLink>>

/** The `token_hash` and `type` an email link carries, or null for a page opened without them. */
function readLink(params: URLSearchParams) {
  const parsed = verifySchema.safeParse({
    tokenHash: params.get('token_hash'),
    type: params.get('type'),
  })
  return parsed.success ? parsed.data : null
}

/**
 * The new link is a password link whichever link expired: one works for an address still waiting
 * for confirmation as well as a confirmed one, which no confirmation mail reaches, and leads to the
 * password form (PLAN.md 7.6).
 */
function ExpiredLink({ returnTo }: { returnTo: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const send = async (email: string) => {
    const failure = await sendPasswordLink(email, returnTo)
    if (!failure) setSentTo(email)
    return failure
  }

  if (sentTo) {
    return (
      <Notice>
        <Trans>We sent a new link to {sentTo}.</Trans>
      </Notice>
    )
  }
  return (
    <EmailOnlyForm defaultEmail="" submitLabel={<Trans>Send a new link</Trans>} onSubmit={send} />
  )
}

/** The page of an email link: nothing is sent until the button is pressed (PLAN.md 7.6, 7.7). */
function RedeemLink({
  link,
  returnTo,
  onRedeemed,
}: {
  link: EmailLink
  returnTo: string
  onRedeemed: () => void
}) {
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const redeem = async () => {
    setPending(true)
    setError(null)
    const failure = await verifyLink(link)
    if (failure) {
      // An account with two-factor authentication goes on to the code screen, which is no error;
      // the page of a link is not held by the gate while the address carries the link.
      if (errorCode(failure) === 'session.mfa-required') {
        void navigate(mfaPath('/auth/confirm'), { replace: true })
      } else {
        setError(failure)
        setPending(false)
      }
    } else {
      onRedeemed()
    }
  }

  if (errorCode(error) === 'auth.otp_expired') {
    return (
      <AuthLayout title={<Trans>We could not sign you in</Trans>}>
        <ErrorMessage error={error} />
        <ExpiredLink returnTo={returnTo} />
      </AuthLayout>
    )
  }
  return (
    <AuthLayout
      title={
        link.type === 'signup' ? (
          <Trans>Confirm your address</Trans>
        ) : (
          <Trans>Reset your password</Trans>
        )
      }
    >
      <p className="text-sm">
        {link.type === 'signup' ? (
          <Trans>Press the button to confirm your address. Then you choose your password.</Trans>
        ) : (
          <Trans>Press the button to choose a new password.</Trans>
        )}
      </p>
      <ErrorMessage error={error} />
      <Button pending={pending} onClick={() => void redeem()}>
        <Trans>Continue</Trans>
      </Button>
      {error ? (
        <Link to={loginPath(returnTo)} className="text-accent text-sm underline">
          <Trans>Go to sign-in</Trans>
        </Link>
      ) : null}
    </AuthLayout>
  )
}

/**
 * `/auth/confirm` (PLAN.md 5.1, 7.6, 7.7): an email link opens it and nothing is sent until its
 * button is pressed, so a mail scanner that follows the link leaves the link unspent. The button
 * signs in, the page then asks for the password and opens the page the round trip started on.
 * Opened without a link, it shows the password form to a browser holding a session and offers
 * the sign-in to any other.
 */
export function ConfirmPage() {
  const { t } = useLingui()
  usePageTitle(t`Confirmation link`)
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [link] = useState(() => readLink(params))
  const [returnTo] = useState(authReturn)
  const status = useSession((state) => state.status)
  const account = useSession((state) => state.account)
  // A session held before the button is no reason to skip it: the link may be for another account.
  const [redeemed, setRedeemed] = useState(false)

  // The address no longer carries the spent link, so a reload cannot press it again (PLAN.md 7.6).
  const redeemedLink = () => {
    setRedeemed(true)
    void navigate({ pathname: location.pathname }, { replace: true })
  }

  const done = () => {
    forgetAuthReturn()
    void navigate(returnTo, { replace: true })
  }

  if (status === 'loading') return <LoadingView />

  if (link && !redeemed) {
    return <RedeemLink link={link} returnTo={returnTo} onRedeemed={redeemedLink} />
  }
  if (account) {
    return (
      <AuthLayout title={<Trans>Choose your password</Trans>}>
        <ChoosePasswordForm email={account.email} returnTo={returnTo} onDone={done} />
      </AuthLayout>
    )
  }
  if (status === 'unavailable') return <UnavailableView onRetry={() => void startSession()} />
  return (
    <AuthLayout title={<Trans>Confirmation link</Trans>}>
      <p className="text-sm">
        <Trans>Open the link from your email to confirm your address or reset your password.</Trans>
      </p>
      <Link to={loginPath(returnTo)} className="text-accent text-sm underline">
        <Trans>Go to sign-in</Trans>
      </Link>
    </AuthLayout>
  )
}
