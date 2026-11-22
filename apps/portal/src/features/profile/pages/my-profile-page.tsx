import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import { useSession } from '../../../shared/lib/session'
import { ErrorMessage, linkClass, LoadingView, Page, Section } from '../../../shared/ui'
import { myProfileOptions } from '../api/profile'
import { AvatarForm } from '../components/avatar-form'
import { ProfileForm } from '../components/profile-form'
import { Publication } from '../components/publication'
import { TakedownNotice } from '../components/takedown-notice'

/**
 * `/account/profile`: where an account changes its profile, uploads its avatar and publishes or
 * withdraws the profile; while an admin holds it down, why, and the way to ask for a review
 * (docs/specs/0016-public-profile.md). The name the profile shows is the account's, changed on
 * the account's page.
 */
export function MyProfilePage() {
  const { t } = useLingui()
  usePageTitle(t`Your profile`)
  const account = useSession((state) => state.account)
  const profile = useQuery(myProfileOptions())

  if (profile.isPending || !account) return <LoadingView />
  if (profile.isError) return <ErrorMessage error={profile.error} />

  return (
    <Page
      title={<Trans>Your profile</Trans>}
      lead={<Trans>What you show of yourself to everyone, once you publish it.</Trans>}
    >
      <p>
        <Link to="/account" className={linkClass}>
          <Trans>Your account</Trans>
        </Link>
      </p>
      {profile.data.takedown && <TakedownNotice takedown={profile.data.takedown} />}
      <Section title={<Trans>Avatar</Trans>}>
        <AvatarForm profile={profile.data} name={account} />
      </Section>
      <Section title={<Trans>What your profile holds</Trans>}>
        <ProfileForm profile={profile.data} />
      </Section>
      <Section title={<Trans>Who sees your profile</Trans>}>
        <Publication profile={profile.data} />
      </Section>
    </Page>
  )
}
