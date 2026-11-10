import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from 'react-router'
import { SIGNED_IN_HOME } from '../../../shared/config/routes'
import { usePageTitle } from '../../../shared/lib/page-title'
import { useSession } from '../../../shared/lib/session'
import { buttonVariants, Section } from '../../../shared/ui'

const primaryLink = buttonVariants({ size: 'lg' })
const secondaryLink = buttonVariants({ variant: 'outline', size: 'lg' })

/** The platform's home page. */
export function LandingPage() {
  const { t } = useLingui()
  usePageTitle(t`Fantasy conventions, in one place`)
  const status = useSession((state) => state.status)
  const account = useSession((state) => state.account)

  return (
    <div className="flex flex-col gap-8 py-8">
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl leading-tight font-semibold">
          <Trans>Fantasy conventions, in one place</Trans>
        </h1>
        <p className="text-muted-foreground text-lg">
          <Trans>
            OPOS is the platform conventions use for their programme, tickets and attendee sign-ups.
            It is free for conventions.
          </Trans>
        </p>
        {status !== 'loading' && (
          <div className="flex flex-col gap-3 sm:flex-row">
            {account ? (
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
