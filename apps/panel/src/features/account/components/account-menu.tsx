import { Trans, useLingui } from '@lingui/react/macro'
import { SUPPORTED_LOCALES, isLocale } from '@opos/i18n'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { languageName, loadLocale, pickLocale } from '../../../shared/lib/i18n'
import {
  Button,
  Card,
  CardContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ErrorMessage,
  FormField,
  NativeSelect,
  NativeSelectOption,
  Separator,
} from '../../../shared/ui'
import { signOut } from '../../auth'
import { accountOptions, mergeSavedAccount, updateAccountOptions } from '../api/account'
import { signInMethods } from '../model/sign-in-methods'
import { TwoFactorCard } from './two-factor-card'

const BROWSER = 'browser'

/**
 * The account menu: who is signed in, the interface language, two-factor
 * authentication, sign-out.
 */
export function AccountMenu() {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const account = useQuery(accountOptions())
  // A failed sign-out leaves the cookies set, so it is shown rather than dropped.
  const [signOutError, setSignOutError] = useState<unknown>(null)
  const update = useMutation({
    ...updateAccountOptions(),
    onSuccess: async (saved) => {
      mergeSavedAccount(queryClient, saved)
      await loadLocale(pickLocale(saved.locale))
    },
  })

  const leave = async () => setSignOutError(await signOut())

  const changeLanguage = (value: string) =>
    update.mutate({ body: { locale: isLocale(value) ? value : null } })

  return (
    <Collapsible className="relative">
      <CollapsibleTrigger render={<Button variant="outline" />}>
        {account.data?.email ?? <Trans>Account</Trans>}
      </CollapsibleTrigger>
      {/* Kept mounted while closed: a two-factor step in progress, recovery codes included, stays. */}
      <CollapsibleContent keepMounted className="absolute top-full right-0 z-10 mt-2 w-80">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <FormField label={t`Interface language`} hint={t`Saved on your account.`}>
              {(control) => (
                <NativeSelect
                  {...control}
                  value={account.data?.locale ?? BROWSER}
                  disabled={!account.data || update.isPending}
                  onChange={(event) => changeLanguage(event.target.value)}
                >
                  <NativeSelectOption
                    value={BROWSER}
                  >{t`The browser's language`}</NativeSelectOption>
                  {SUPPORTED_LOCALES.map((locale) => (
                    <NativeSelectOption key={locale} value={locale} lang={locale}>
                      {languageName(locale)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <ErrorMessage error={update.error} />
            {account.data && (
              <>
                <Separator />
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium">
                    <Trans>Two-factor authentication</Trans>
                  </h2>
                  <TwoFactorCard
                    email={account.data.email}
                    mfaEnabled={account.data.mfaEnabled}
                    methods={signInMethods(account.data.signInMethods)}
                  />
                </section>
              </>
            )}
            <ErrorMessage error={signOutError} />
            <Button variant="link" className="self-start" onClick={() => void leave()}>
              <Trans>Sign out</Trans>
            </Button>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  )
}
