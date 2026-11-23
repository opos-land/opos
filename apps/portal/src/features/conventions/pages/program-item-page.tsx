import { Plural, Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import { ErrorMessage, linkClass, LoadingView, NotFoundView, Page } from '../../../shared/ui'
import { conventionOptions, editionOptions, programItemOptions } from '../api/conventions'
import { LikeButton } from '../components/like-button'
import { SpeakerNames } from '../components/speaker-names'
import { useConventionTime } from '../hooks/use-convention-time'

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
  const count = speakers.length
  return (
    <Page
      title={title}
      lead={<span className="block first-letter:uppercase">{time.when(startsAt, endsAt)}</span>}
    >
      <p>
        <Link to={`/conventions/${tenantSlug}/${editionSlug}/program`} className={linkClass}>
          <Trans>The whole programme</Trans>
        </Link>
      </p>
      {description && <p className="whitespace-pre-line">{description}</p>}
      {count > 0 && (
        <p>
          <Plural value={count} one="Speaker:" other="Speakers:" />{' '}
          <SpeakerNames speakers={speakers} />
        </p>
      )}
      <p className="text-muted-foreground text-sm">
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
