import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../../../shared/lib/session'
import { Button, ErrorMessage, LoadingView, Page, Section } from '../../../shared/ui'
import { signOut } from '../../auth'
import { accountOptions } from '../api/account'
import { DeleteAccount } from '../components/delete-account'
import { LanguageForm } from '../components/language-form'
import { ProfileForm } from '../components/profile-form'
import { signInMethods } from '../model/sign-in-methods'

/** Account settings (PLAN.md 9): the names, the interface language, sign-out and deletion. */
export function AccountPage() {
  const user = useSession((state) => state.session?.user)
  const account = useQuery(accountOptions())

  if (account.isPending) return <LoadingView />
  if (account.isError) return <ErrorMessage error={account.error} />

  const { email } = account.data

  return (
    <Page title={<Trans>Your account</Trans>} lead={<Trans>Signed in as {email}</Trans>}>
      <Section title={<Trans>Your name</Trans>}>
        <ProfileForm account={account.data} />
      </Section>
      <Section title={<Trans>Language</Trans>}>
        <LanguageForm account={account.data} />
      </Section>
      <Section title={<Trans>Sign out</Trans>}>
        <p className="text-sm">
          <Trans>Signing out ends your sessions on every device.</Trans>
        </p>
        <Button variant="secondary" className="self-start" onClick={() => void signOut()}>
          <Trans>Sign out</Trans>
        </Button>
      </Section>
      <Section title={<Trans>Delete the account</Trans>}>
        {user && <DeleteAccount email={email} methods={signInMethods(user)} />}
      </Section>
    </Page>
  )
}
