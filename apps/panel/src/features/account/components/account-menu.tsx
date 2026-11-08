import { Trans, useLingui } from '@lingui/react/macro'
import { SUPPORTED_LOCALES, isLocale } from '@opos/i18n'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { languageName, loadLocale, pickLocale } from '../../../shared/lib/i18n'
import { ErrorMessage, Field, inputClass } from '../../../shared/ui'
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
    <details className="relative">
      <summary className="rounded-box border-line bg-surface cursor-pointer border px-3 py-1.5 text-sm">
        {account.data?.email ?? <Trans>Account</Trans>}
      </summary>
      <div className="rounded-box border-line bg-surface absolute right-0 z-10 mt-2 flex w-80 flex-col gap-4 border p-4 shadow-sm">
        <Field label={t`Interface language`} hint={t`Saved on your account.`}>
          {(control) => (
            <select
              {...control}
              className={inputClass}
              value={account.data?.locale ?? BROWSER}
              disabled={!account.data || update.isPending}
              onChange={(event) => changeLanguage(event.target.value)}
            >
              <option value={BROWSER}>{t`The browser's language`}</option>
              {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale} value={locale} lang={locale}>
                  {languageName(locale)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <ErrorMessage error={update.error} />
        {account.data && (
          <section className="border-line flex flex-col gap-2 border-t pt-4">
            <h2 className="text-sm font-medium">
              <Trans>Two-factor authentication</Trans>
            </h2>
            <TwoFactorCard
              email={account.data.email}
              mfaEnabled={account.data.mfaEnabled}
              methods={signInMethods(account.data.signInMethods)}
            />
          </section>
        )}
        <ErrorMessage error={signOutError} />
        <button
          type="button"
          className="text-accent self-start text-sm underline"
          onClick={() => void leave()}
        >
          <Trans>Sign out</Trans>
        </button>
      </div>
    </details>
  )
}
