import { Plural, Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import { ErrorMessage, linkClass, LoadingView, NotFoundView, Page } from '../../../shared/ui'
import { conventionOptions, editionOptions, programItemOptions } from '../api/conventions'
import { LikeButton } from '../components/like-button'
import { useConventionTime } from '../hooks/use-convention-time'
import { speakerNames } from '../model/program-days'

/** One programme item's details and its like; ratings and comments come with the reviews. */
export function ProgramItemPage() {
  const { tenantSlug = '', editionSlug = '', programItemId = '' } = useParams()
  const convention = useQuery(conventionOptions(tenantSlug))
  const item = useQuery(programItemOptions(tenantSlug, editionSlug, programItemId))
  const edition = useQuery(editionOptions(tenantSlug, editionSlug))
  usePageTitle(item.data?.title, edition.data?.name ?? convention.data?.name)
  const time = useConventionTime(convention.data?.timezone ?? 'UTC')

  if (convention.isError || item.isError) {
    const failed = convention.error ?? item.error
    return isNotFound(failed) ? <NotFoundView /> : <ErrorMessage error={failed} />
  }
  if (convention.isPending || item.isPending) return <LoadingView />

  const { title, description, startsAt, endsAt, speakers, likeCount: likes } = item.data
  const names = speakerNames(speakers)
  const count = speakers.length
  return (
    <Page
      title={title}
      lead={<span className="block first-letter:uppercase">{time.when(startsAt, endsAt)}</span>}
    >
      <p>
        <Link to={`/conventions/${tenantSlug}/${editionSlug}`} className={linkClass}>
          <Trans>The whole programme</Trans>
        </Link>
      </p>
      {description && <p className="whitespace-pre-line">{description}</p>}
      {names && (
        <p>
          <Plural value={count} one={`Speaker: ${names}`} other={`Speakers: ${names}`} />
        </p>
      )}
      <p className="text-muted text-sm">
        <Plural value={likes} one="# like" other="# likes" />
      </p>
      {edition.data && (
        <LikeButton
          tenantSlug={tenantSlug}
          editionId={edition.data.id}
          programItemId={programItemId}
          ended={new Date(edition.data.endsAt) <= new Date()}
        />
      )}
    </Page>
  )
}
