import { Trans } from '@lingui/react/macro'
import { type PublicEdition } from '@opos/contract'
import { Link } from 'react-router'
import { buttonVariants } from '../../../shared/ui'
import { useConventionTime } from '../hooks/use-convention-time'

/**
 * What a visitor needs first of an edition: when it takes place, in the convention's time zone,
 * where, and the way on to its programme and its shop. An edition with no venue set says nothing of a place.
 */
export function EditionSummary({
  edition,
  timeZone,
  editionPath,
}: {
  edition: PublicEdition
  timeZone: string
  editionPath: string
}) {
  const time = useConventionTime(timeZone)
  const venue = [edition.venueName, edition.venueAddress, edition.venueCity].filter(
    (part) => part !== null,
  )

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-sm">
            <Trans>When</Trans>
          </dt>
          <dd>{time.dates(edition.startsAt, edition.endsAt)}</dd>
        </div>
        {venue.length > 0 && (
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-sm">
              <Trans>Where</Trans>
            </dt>
            <dd>
              <address className="flex flex-col not-italic">
                {venue.map((part) => (
                  <span key={part}>{part}</span>
                ))}
              </address>
            </dd>
          </div>
        )}
      </dl>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link to={`${editionPath}/program`} className={buttonVariants()}>
          <Trans>See the programme</Trans>
        </Link>
        <Link to={`${editionPath}/shop`} className={buttonVariants({ variant: 'outline' })}>
          <Trans>Go to the shop</Trans>
        </Link>
      </div>
    </div>
  )
}
