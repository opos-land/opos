import { Trans, useLingui } from '@lingui/react/macro'
import { SUPPORTED_LOCALES, isLocale } from '@opos/i18n'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { languageName, loadLocale, pickLocale } from '../../../shared/lib/i18n'
import { ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { signOut } from '../../auth'
import { accountKey, accountOptions, updateAccountOptions } from '../api/account'

const BROWSER = 'browser'

/** The account menu (PLAN.md 8): who is signed in, the interface language, sign-out. */
export function AccountMenu() {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const account = useQuery(accountOptions())
  // A failed sign-out leaves the cookies set, so it is shown rather than dropped.
  const [signOutError, setSignOutError] = useState<unknown>(null)
  const update = useMutation({
    ...updateAccountOptions(),
    onSuccess: async (saved) => {
      queryClient.setQueryData(accountKey(), saved)
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
      <div className="rounded-box border-line bg-surface absolute right-0 z-10 mt-2 flex w-72 flex-col gap-4 border p-4 shadow-sm">
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
