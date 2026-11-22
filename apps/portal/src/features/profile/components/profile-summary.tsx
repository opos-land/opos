import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { MY_PROFILE_PATH } from '../../../shared/config/routes'
import { useSession } from '../../../shared/lib/session'
import { ErrorMessage, linkClass } from '../../../shared/ui'
import { myProfileOptions } from '../api/profile'
import { AccountAvatar } from './account-avatar'

/**
 * The profile as the account's page shows it: the avatar, whether the profile is public, private
 * or taken down, and the way to the page where it is changed
 * (docs/specs/0016-public-profile.md, Screens).
 */
export function ProfileSummary() {
  const { t } = useLingui()
  const account = useSession((state) => state.account)
  const profile = useQuery(myProfileOptions())

  if (profile.isError) return <ErrorMessage error={profile.error} />
  if (profile.isPending || !account) return null

  const { avatar, published, takedown } = profile.data
  return (
    <>
      <div className="flex items-center gap-4">
        <AccountAvatar avatar={avatar} name={account} alt={t`Your avatar`} variant="small" />
        <p className="text-sm">
          {takedown ? (
            <Trans>An administrator took your profile down. See why on its page.</Trans>
          ) : published ? (
            <Trans>Your profile is public: anyone reads it.</Trans>
          ) : (
            <Trans>Your profile is private: only you see it.</Trans>
          )}
        </p>
      </div>
      <p>
        <Link to={MY_PROFILE_PATH} className={linkClass}>
          <Trans>Change your profile</Trans>
        </Link>
      </p>
    </>
  )
}
