import { useLingui } from '@lingui/react/macro'
import { type Account } from '@opos/contract'
import { isLocale, SUPPORTED_LOCALES } from '@opos/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { languageName, loadLocale, pickLocale } from '../../../shared/lib/i18n'
import { ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { accountKey, updateAccountOptions } from '../api/account'

const BROWSER = 'browser'

/**
 * The interface language (PLAN.md 6): a language, or the browser's, kept on the account through
 * `PATCH /me`, so it follows the user to every device.
 */
export function LanguageForm({ account }: { account: Account }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const update = useMutation({
    ...updateAccountOptions(),
    onSuccess: async (saved) => {
      queryClient.setQueryData(accountKey(), saved)
      await loadLocale(pickLocale(saved.locale))
    },
  })

  const change = (value: string) =>
    update.mutate({ body: { locale: isLocale(value) ? value : null } })

  return (
    <div className="flex flex-col gap-3">
      <Field label={t`Interface language`} hint={t`Saved on your account.`}>
        {(control) => (
          <select
            {...control}
            className={inputClass}
            value={account.locale ?? BROWSER}
            disabled={update.isPending}
            onChange={(event) => change(event.target.value)}
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
    </div>
  )
}
