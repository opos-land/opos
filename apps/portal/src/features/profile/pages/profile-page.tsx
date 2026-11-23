import { Trans, useLingui } from '@lingui/react/macro'
import { publicName } from '@opos/i18n/names'
import { interestNames } from '@opos/i18n/profiles'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import { useNoIndex } from '../../../shared/lib/no-index'
import { usePageTitle } from '../../../shared/lib/page-title'
import { Badge, ErrorMessage, linkClass, LoadingView, NotFoundView, Page } from '../../../shared/ui'
import { publicProfileOptions } from '../api/profile'
import { AccountAvatar } from '../components/account-avatar'

/**
 * `/profiles/<profile>`: a published profile, for anyone, with no sign-in
 * (docs/specs/0016-public-profile.md, P8-P12): the public name, the avatar and what the profile
 * holds, as its account wrote it. A link is shown as its address and vouches for nothing; nothing
 * is fetched from it. A profile that is not public is a page that is not there.
 */
export function ProfilePage() {
  const { t, i18n } = useLingui()
  const { profileId = '' } = useParams()
  const profile = useQuery(publicProfileOptions(profileId))
  const name = profile.data ? publicName(i18n, profile.data) : undefined
  usePageTitle(name)
  useNoIndex()

  if (profile.isError) {
    return isNotFound(profile.error) ? <NotFoundView /> : <ErrorMessage error={profile.error} />
  }
  if (profile.isPending || !name) return <LoadingView />

  const { avatar, pronouns, city, description, links, interests } = profile.data
  const holdsNothing =
    !pronouns && !city && !description && links.length === 0 && interests.length === 0

  return (
    <Page title={name} lead={pronouns}>
      <AccountAvatar avatar={avatar} name={profile.data} alt={t`Avatar of ${name}`} />
      {city && <p>{city}</p>}
      {description && <p className="whitespace-pre-line">{description}</p>}
      {interests.length > 0 && (
        <ul aria-label={t`Interests`} className="flex flex-wrap gap-2">
          {interests.map((interest) => (
            <li key={interest}>
              <Badge variant="secondary">{i18n._(interestNames[interest]!)}</Badge>
            </li>
          ))}
        </ul>
      )}
      {links.length > 0 && (
        <ul aria-label={t`Links`} className="flex flex-col gap-1">
          {links.map((link) => (
            <li key={link} className="break-all">
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className={linkClass}
              >
                {link}
              </a>
            </li>
          ))}
        </ul>
      )}
      {holdsNothing && (
        <p className="text-muted-foreground">
          <Trans>This profile holds nothing yet.</Trans>
        </p>
      )}
      <p className="text-sm">
        <Link to={`/profiles/${profileId}/report`} className={linkClass}>
          <Trans>Report this profile</Trans>
        </Link>
      </p>
    </Page>
  )
}
