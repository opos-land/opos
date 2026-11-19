import { Trans } from '@lingui/react/macro'
import { type EditionListPeriod, type ListedEdition } from '@opos/contract'
import { useInfiniteQuery } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button, ErrorMessage, linkClass, LoadingView, Section } from '../../../shared/ui'
import { editionListOptions } from '../api/conventions'
import { useConventionTime } from '../hooks/use-convention-time'
import { conventionBeside } from '../model/listed-edition'
import { ConventionLogo } from './convention-logo'

/**
 * A row of the list: the edition with its convention's logo, the convention's name where the
 * edition's own does not hold it, its dates in the convention's time zone and its city.
 */
function EditionRow({ edition }: { edition: ListedEdition }) {
  const time = useConventionTime(edition.tenant.timezone)
  const convention = conventionBeside(edition.name, edition.tenant.name)
  return (
    <li className="flex items-center gap-3 border-t pt-3 first:border-t-0 first:pt-0">
      <ConventionLogo tenantSlug={edition.tenant.slug} logo={edition.tenant.logo} variant="small" />
      <div className="flex min-w-0 flex-col gap-1">
        <Link to={`/conventions/${edition.tenant.slug}/${edition.slug}`} className={linkClass}>
          {edition.name}
        </Link>
        {convention && <span className="text-sm">{convention}</span>}
        <span className="text-muted-foreground text-sm">
          {time.dates(edition.startsAt, edition.endsAt)}
        </span>
        {edition.venueCity && <span className="text-sm">{edition.venueCity}</span>}
      </div>
    </li>
  )
}

/** One part of the list, read a page at a time: its first rows, and more when asked for. */
function EditionListPart({
  period,
  title,
  empty,
}: {
  period: EditionListPeriod
  title: ReactNode
  empty: ReactNode
}) {
  const list = useInfiniteQuery(editionListOptions(period))
  const editions = list.data?.pages.flatMap((page) => page.editions) ?? []

  return (
    <Section title={title}>
      {list.isPending ? (
        <LoadingView />
      ) : list.isError && editions.length === 0 ? (
        <ErrorMessage error={list.error} />
      ) : editions.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {editions.map((edition) => (
              <EditionRow key={edition.id} edition={edition} />
            ))}
          </ul>
          {list.isFetchNextPageError && <ErrorMessage error={list.error} />}
          {list.hasNextPage && (
            <Button
              variant="outline"
              className="self-start"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              <Trans>Show more</Trans>
            </Button>
          )}
        </>
      )}
    </Section>
  )
}

/**
 * The published editions of every convention, for the portal's home page: the coming ones, then
 * the past ones.
 */
export function EditionDirectory() {
  return (
    <>
      <EditionListPart
        period="coming"
        title={<Trans>Coming editions</Trans>}
        empty={<Trans>No edition is coming yet.</Trans>}
      />
      <EditionListPart
        period="past"
        title={<Trans>Past editions</Trans>}
        empty={<Trans>No edition has ended yet.</Trans>}
      />
    </>
  )
}
