import { Plural, Trans } from '@lingui/react/macro'
import { type PublicProgramItem } from '@opos/contract'
import { Link } from 'react-router'
import { linkClass } from '../../../shared/ui'
import { useConventionTime } from '../hooks/use-convention-time'
import { programDays } from '../model/program-days'
import { SpeakerNames } from './speaker-names'

/** An edition's programme, day by day in the convention's zone, in one column. */
export function ProgramList({
  items,
  timeZone,
  editionPath,
}: {
  items: PublicProgramItem[]
  timeZone: string
  editionPath: string
}) {
  const time = useConventionTime(timeZone)

  if (items.length === 0) {
    return (
      <p>
        <Trans>There is no programme yet.</Trans>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {programDays(items, timeZone).map(({ day, items: dayItems }) => (
        <section key={day} className="flex flex-col gap-3">
          <h3 className="font-semibold first-letter:uppercase">
            {time.day(dayItems[0]!.startsAt)}
          </h3>
          <ul className="flex flex-col gap-3">
            {dayItems.map((item) => {
              const count = item.speakers.length
              const likes = item.likeCount
              return (
                <li key={item.id} className="flex flex-col gap-1 border-t pt-3">
                  <span className="text-muted-foreground text-sm">
                    {time.hours(item.startsAt, item.endsAt)}
                  </span>
                  <Link to={`${editionPath}/program/${item.id}`} className={linkClass}>
                    {item.title}
                  </Link>
                  {count > 0 && (
                    <span className="text-sm">
                      <Plural value={count} one="Speaker:" other="Speakers:" />{' '}
                      <SpeakerNames speakers={item.speakers} />
                    </span>
                  )}
                  <span className="text-muted-foreground text-sm">
                    <Plural value={likes} one="# like" other="# likes" />
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
