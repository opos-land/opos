import { Trans } from '@lingui/react/macro'
import { Link, useLocation } from 'react-router'
import { SIGNED_IN_HOME } from '../../../shared/config/routes'
import { useSession } from '../../../shared/lib/session'
import { Notice, Section } from '../../../shared/ui'
import { type AccountDeletedState } from '../../account'

const primaryLink =
  'rounded-box bg-accent text-accent-ink border-accent inline-flex min-h-11 items-center justify-center border px-4 py-2 font-medium hover:opacity-90'
const secondaryLink =
  'rounded-box bg-surface text-ink border-line inline-flex min-h-11 items-center justify-center border px-4 py-2 font-medium hover:border-ink'

const deleted = (state: unknown) =>
  typeof state === 'object' &&
  state !== null &&
  (state as Partial<AccountDeletedState>).accountDeleted === true

/** The platform's home page (PLAN.md 9). */
export function LandingPage() {
  const location = useLocation()
  const status = useSession((state) => state.status)
  const session = useSession((state) => state.session)

  return (
    <div className="flex flex-col gap-8 py-8">
      {deleted(location.state) && (
        <Notice>
          <Trans>Your account has been deleted.</Trans>
        </Notice>
      )}
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl leading-tight font-semibold">
          <Trans>Fantasy conventions, in one place</Trans>
        </h1>
        <p className="text-muted text-lg">
          <Trans>
            OPOS is the platform conventions use for their programme, tickets and attendee sign-ups.
            It is free for conventions.
          </Trans>
        </p>
        {status === 'ready' && (
          <div className="flex flex-col gap-3 sm:flex-row">
            {session ? (
              <Link to={SIGNED_IN_HOME} className={primaryLink}>
                <Trans>Go to your account</Trans>
              </Link>
            ) : (
              <>
                <Link to="/register" className={primaryLink}>
                  <Trans>Create an account</Trans>
                </Link>
                <Link to="/login" className={secondaryLink}>
                  <Trans>Sign in</Trans>
                </Link>
              </>
            )}
          </div>
        )}
      </header>
      <Section title={<Trans>For attendees</Trans>}>
        <p>
          <Trans>
            One account for every convention: sign up for an edition, like programme items to build
            your personal schedule, review the ones you attended and find your tickets in one place.
            It works in a phone browser, with no app to install.
          </Trans>
        </p>
      </Section>
      <Section title={<Trans>For organizers</Trans>}>
        <p>
          <Trans>
            A convention runs its team, editions, programme and ticket sales in the organizer panel.
            Ticket payments go straight to the convention’s own payment provider account: OPOS never
            holds the money.
          </Trans>
        </p>
      </Section>
    </div>
  )
}
