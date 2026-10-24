import { Trans, useLingui } from '@lingui/react/macro'
import { formatDateTime } from '@opos/i18n'
import { type InvitationPreview } from '@opos/contract'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { activeLocale } from '../../../shared/lib/i18n'
import { useSession } from '../../../shared/lib/session'
import { ErrorMessage, LoadingView, Notice } from '../../../shared/ui'
import { sendPasswordLink, signUpWithEmail } from '../api/auth'
import { invitationPreviewOptions } from '../api/invitations'
import { AcceptInvitation } from '../components/accept-invitation'
import { AuthLayout } from '../components/auth-layout'
import { ChoosePasswordForm } from '../components/choose-password-form'
import { EmailOnlyForm } from '../components/email-only-form'
import { GoogleButton } from '../components/google-button'
import { SignInForm } from '../components/sign-in-form'
import {
  rememberInvitation,
  setAwaitingPassword,
  type StoredInvitation,
  storedInvitation,
} from '../model/invitation-storage'

const sameEmail = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase()

/** The invitee's browser zone: the preview names no convention time zone. */
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

function PreviewSummary({ preview }: { preview: InvitationPreview }) {
  const tenantName = preview.tenant.name
  const email = preview.email
  const validUntil = formatDateTime(new Date(preview.validUntil), activeLocale(), browserTimeZone())
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        <Trans>
          You are invited to the organizing team of <strong>{tenantName}</strong>.
        </Trans>
      </p>
      <p className="text-muted">
        <Trans>
          The invitation is for {email} and is valid until {validUntil}.
        </Trans>
      </p>
    </div>
  )
}

/** Signed out: sign in, register with email or Google, or ask for a password link. */
function JoinOptions({
  preview,
  onAwaitingPassword,
}: {
  preview: InvitationPreview
  onAwaitingPassword: (awaiting: boolean) => void
}) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const signUp = async (email: string) => {
    const error = await signUpWithEmail(email)
    if (error) return error
    onAwaitingPassword(true)
    setSentTo(email)
    return null
  }

  const passwordLink = async (email: string) => {
    const error = await sendPasswordLink(email)
    if (error) return error
    onAwaitingPassword(true)
    setSentTo(email)
    return null
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-3">
        <Notice>
          <Trans>
            We sent a link to {sentTo}. Open it in this browser to choose your password and join the
            team.
          </Trans>
        </Notice>
        <p className="text-muted text-sm">
          <Trans>
            If no message arrives within a few minutes, the address may already have an account:
            sign in, or ask for a password link.
          </Trans>
        </p>
        <button
          type="button"
          className="text-accent self-start text-sm underline"
          onClick={() => setSentTo(null)}
        >
          <Trans>Back to the invitation</Trans>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="sign-in" className="flex flex-col gap-3">
        <h2 id="sign-in" className="font-semibold">
          <Trans>I already have an account</Trans>
        </h2>
        <SignInForm defaultEmail={preview.email} onSignedIn={() => onAwaitingPassword(false)} />
        <GoogleButton onBeforeRedirect={() => onAwaitingPassword(false)} />
      </section>
      <section aria-labelledby="sign-up" className="border-line flex flex-col gap-3 border-t pt-6">
        <h2 id="sign-up" className="font-semibold">
          <Trans>I am new to OPOS</Trans>
        </h2>
        <p className="text-muted text-sm">
          <Trans>
            We will send a confirmation link to your address. Once you open it, you choose your
            password here and join the team. You can also continue with Google above.
          </Trans>
        </p>
        <EmailOnlyForm
          defaultEmail={preview.email}
          submitLabel={<Trans>Create an account</Trans>}
          onSubmit={signUp}
        />
      </section>
      <section
        aria-labelledby="password-link"
        className="border-line flex flex-col gap-3 border-t pt-6"
      >
        <h2 id="password-link" className="font-semibold">
          <Trans>Cannot sign in?</Trans>
        </h2>
        <p className="text-muted text-sm">
          <Trans>
            If you confirmed your address in another browser, or someone else registered it before
            you, ask for a link that lets you set a new password.
          </Trans>
        </p>
        <EmailOnlyForm
          defaultEmail={preview.email}
          variant="secondary"
          submitLabel={<Trans>Send a password link</Trans>}
          onSubmit={passwordLink}
        />
      </section>
    </div>
  )
}

/**
 * Invitation acceptance (PLAN.md 7.7): the convention and the invited address, sign-in, sign-up
 * with email or Google, the password chosen after the address is confirmed, then acceptance.
 */
export function InvitationPage() {
  const { t } = useLingui()
  const [params] = useSearchParams()
  const urlToken = params.get('token')
  const [invitation, setInvitation] = useState<StoredInvitation | null>(() =>
    urlToken ? rememberInvitation(urlToken) : storedInvitation(),
  )
  const status = useSession((state) => state.status)
  const session = useSession((state) => state.session)
  const preview = useQuery({
    ...invitationPreviewOptions(invitation?.token ?? ''),
    enabled: Boolean(invitation),
  })

  const awaitPassword = (awaitingPassword: boolean) => {
    setAwaitingPassword(awaitingPassword)
    setInvitation((current) => current && { ...current, awaitingPassword })
  }

  if (!invitation) {
    return (
      <AuthLayout title={t`Invitation`}>
        <p className="text-sm">
          {t`Open the invitation link from your email to join a convention's team.`}
        </p>
      </AuthLayout>
    )
  }

  if (status === 'loading' || preview.isPending) return <LoadingView />

  if (preview.isError) {
    return (
      <AuthLayout title={t`Invitation`}>
        <ErrorMessage error={preview.error} />
        <Link to="/login" className="text-accent text-sm underline">
          <Trans>Go to sign-in</Trans>
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t`Join the organizing team`}>
      <PreviewSummary preview={preview.data} />
      {session &&
      invitation.awaitingPassword &&
      sameEmail(session.user.email, preview.data.email) ? (
        <ChoosePasswordForm
          email={session.user.email ?? preview.data.email}
          onDone={() => awaitPassword(false)}
        />
      ) : session ? (
        <AcceptInvitation token={invitation.token} email={session.user.email ?? ''} />
      ) : (
        <JoinOptions preview={preview.data} onAwaitingPassword={awaitPassword} />
      )}
    </AuthLayout>
  )
}
