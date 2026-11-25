import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { type Account } from '@opos/contract'
import { isLocale, SUPPORTED_LOCALES } from '@opos/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { accountLocale, languageName, loadLocale } from '../../../shared/lib/i18n'
import { FormField, NativeSelect, NativeSelectOption } from '../../../shared/ui'
import { mergeSavedAccount, updateAccountOptions } from '../api/account'

/**
 * The interface language, kept on the account through `PATCH /me`, so it follows the user to
 * every device; Polish until the account chooses one.
 */
export function LanguageForm({ account }: { account: Account }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const update = useMutation({
    ...updateAccountOptions(),
    meta: { success: msg`The interface language is saved.` },
    onSuccess: async (saved) => {
      mergeSavedAccount(queryClient, saved)
      await loadLocale(accountLocale(saved.locale))
    },
  })

  const change = (value: string) => {
    if (isLocale(value)) update.mutate({ body: { locale: value } })
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField label={t`Interface language`} hint={t`Saved on your account.`}>
        {(control) => (
          <NativeSelect
            {...control}
            value={accountLocale(account.locale)}
            disabled={update.isPending}
            onChange={(event) => change(event.target.value)}
          >
            {SUPPORTED_LOCALES.map((locale) => (
              <NativeSelectOption key={locale} value={locale} lang={locale}>
                {languageName(locale)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
    </div>
  )
}
