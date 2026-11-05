import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { usePageTitle } from '../../../shared/lib/page-title'
import { Button, ErrorMessage, LoadingView, Page, Section } from '../../../shared/ui'
import { signOut } from '../../auth'
import { accountOptions } from '../api/account'
import { DeleteAccount } from '../components/delete-account'
import { LanguageForm } from '../components/language-form'
import { ProfileForm } from '../components/profile-form'
import { TwoFactorCard } from '../components/two-factor-card'
import { signInMethods } from '../model/sign-in-methods'

/**
 * Account settings (PLAN.md 9): the names, the interface language, two-factor authentication,
 * sign-out and deletion.
 */
export function AccountPage() {
  const { t } = useLingui()
  usePageTitle(t`Your account`)
  const account = useQuery(accountOptions())
  // A failed sign-out leaves the cookies set, so it is shown rather than dropped.
  const [signOutError, setSignOutError] = useState<unknown>(null)

  if (account.isPending) return <LoadingView />
  if (account.isError) return <ErrorMessage error={account.error} />

  const { id, email, signInMethods: methods } = account.data

  return (
    <Page title={<Trans>Your account</Trans>} lead={<Trans>Signed in as {email}</Trans>}>
      <Section title={<Trans>Your name</Trans>}>
        <ProfileForm account={account.data} />
      </Section>
      <Section title={<Trans>Language</Trans>}>
        <LanguageForm account={account.data} />
      </Section>
      <Section title={<Trans>Two-factor authentication</Trans>}>
        <TwoFactorCard
          email={email}
          mfaEnabled={account.data.mfaEnabled}
          methods={signInMethods(methods)}
        />
      </Section>
      <Section title={<Trans>Sign out</Trans>}>
        <p className="text-sm">
          <Trans>Signing out ends your session on this device.</Trans>
        </p>
        <ErrorMessage error={signOutError} />
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => void signOut().then(setSignOutError)}
        >
          <Trans>Sign out</Trans>
        </Button>
      </Section>
      <Section title={<Trans>Delete the account</Trans>}>
        <DeleteAccount userId={id} email={email} methods={signInMethods(methods)} />
      </Section>
    </Page>
  )
}
