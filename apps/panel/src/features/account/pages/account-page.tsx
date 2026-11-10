import { Trans, useLingui } from '@lingui/react/macro'
import { SUPPORTED_LOCALES, isLocale } from '@opos/i18n'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { languageName, loadLocale, pickLocale } from '../../../shared/lib/i18n'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  FormField,
  NativeSelect,
  NativeSelectOption,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { accountOptions, mergeSavedAccount, updateAccountOptions } from '../api/account'
import { TwoFactorCard } from '../components/two-factor-card'
import { signInMethods } from '../model/sign-in-methods'

const BROWSER = 'browser'

/** The signed-in account, above any convention: its interface language and two-factor authentication. */
export function AccountPage() {
  const { t } = useLingui()
  usePageTitle(t`Account`)
  const queryClient = useQueryClient()
  const account = useQuery(accountOptions())
  const update = useMutation({
    ...updateAccountOptions(),
    onSuccess: async (saved) => {
      mergeSavedAccount(queryClient, saved)
      await loadLocale(pickLocale(saved.locale))
    },
  })

  const changeLanguage = (value: string) =>
    update.mutate({ body: { locale: isLocale(value) ? value : null } })

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={<Trans>Account</Trans>} description={account.data?.email} />
      <ErrorMessage error={account.error} />
      <Section title={<Trans>Preferences</Trans>}>
        <FormField label={t`Interface language`} hint={t`Saved on your account.`}>
          {(control) => (
            <NativeSelect
              {...control}
              value={account.data?.locale ?? BROWSER}
              disabled={!account.data || update.isPending}
              onChange={(event) => changeLanguage(event.target.value)}
            >
              <NativeSelectOption value={BROWSER}>{t`The browser's language`}</NativeSelectOption>
              {SUPPORTED_LOCALES.map((locale) => (
                <NativeSelectOption key={locale} value={locale} lang={locale}>
                  {languageName(locale)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <ErrorMessage error={update.error} />
      </Section>
      {account.data && (
        <Section title={<Trans>Two-factor authentication</Trans>}>
          <TwoFactorCard
            email={account.data.email}
            mfaEnabled={account.data.mfaEnabled}
            methods={signInMethods(account.data.signInMethods)}
          />
        </Section>
      )}
    </div>
  )
}
