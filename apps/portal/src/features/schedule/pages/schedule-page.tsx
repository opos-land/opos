import { Trans, useLingui } from '@lingui/react/macro'
import { formatDateTime, isLocale } from '@opos/i18n'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { activeLocale } from '../../../shared/lib/i18n'
import { usePageTitle } from '../../../shared/lib/page-title'
import { ErrorMessage, linkClass, LoadingView, Page } from '../../../shared/ui'
import { scheduleOptions } from '../api/schedule'
import { scheduleDays } from '../model/schedule-days'

/** The liked items across conventions by day, each in its convention's zone. */
export function SchedulePage() {
  const { i18n, t } = useLingui()
  usePageTitle(t`My schedule`)
  const locale = isLocale(i18n.locale) ? i18n.locale : activeLocale()
  const schedule = useQuery(scheduleOptions())

  return (
    <Page title={<Trans>My schedule</Trans>}>
      {schedule.isPending ? (
        <LoadingView />
      ) : schedule.isError ? (
        <ErrorMessage error={schedule.error} />
      ) : schedule.data.length === 0 ? (
        <p>
          <Trans>You have not liked any programme items yet.</Trans>
        </p>
      ) : (
        scheduleDays(schedule.data).map(({ day, items }) => (
          <section key={day} className="flex flex-col gap-3">
            <h2 className="font-semibold first-letter:uppercase">
              {formatDateTime(new Date(items[0]!.startsAt), locale, items[0]!.tenant.timezone, {
                dateStyle: 'full',
              })}
            </h2>
            <ul className="flex flex-col gap-3">
              {items.map((item) => {
                const tenantName = item.tenant.name
                const editionName = item.edition.name
                const hours = new Intl.DateTimeFormat(locale, {
                  timeStyle: 'short',
                  timeZone: item.tenant.timezone,
                }).formatRange(new Date(item.startsAt), new Date(item.endsAt))
                return (
                  <li key={item.id} className="flex flex-col gap-1 border-t pt-3">
                    <span className="text-muted-foreground text-sm">{hours}</span>
                    <Link
                      to={`/conventions/${item.tenant.slug}/${item.edition.slug}/program/${item.id}`}
                      className={linkClass}
                    >
                      {item.title}
                    </Link>
                    <span className="text-sm">
                      <Trans>
                        {tenantName}, {editionName}
                      </Trans>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </Page>
  )
}
