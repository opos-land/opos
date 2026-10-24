import { Trans, useLingui } from '@lingui/react/macro'
import { SUPPORTED_LOCALES, isLocale } from '@opos/i18n'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { languageName, loadLocale, pickLocale } from '../../../shared/lib/i18n'
import { ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { accountKey, accountOptions, signOut, updateAccountOptions } from '../api/account'

const BROWSER = 'browser'

/** The account menu (PLAN.md 8): who is signed in, the interface language, sign-out. */
export function AccountMenu() {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const account = useQuery(accountOptions())
  const update = useMutation({
    ...updateAccountOptions(),
    onSuccess: async (saved) => {
      queryClient.setQueryData(accountKey(), saved)
      await loadLocale(pickLocale(saved.locale))
    },
  })

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
        <button
          type="button"
          className="text-accent self-start text-sm underline"
          onClick={() => void signOut()}
        >
          <Trans>Sign out</Trans>
        </button>
      </div>
    </details>
  )
}
