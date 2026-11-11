import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { type Account } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isTheme } from '../../../shared/lib/theme'
import { FormField, NativeSelect, NativeSelectOption } from '../../../shared/ui'
import { mergeSavedAccount, updateAccountOptions } from '../api/account'

const SYSTEM = 'system'

/**
 * The interface theme: light, dark or the system's, kept on the account through `PATCH /me`, so it
 * follows the user to every device. AccountTheme shows it once it is in the cached account.
 */
export function ThemeForm({ account }: { account: Account }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const update = useMutation({
    ...updateAccountOptions(),
    meta: { success: msg`The interface theme is saved.` },
    onSuccess: (saved) => mergeSavedAccount(queryClient, saved),
  })

  const change = (value: string) =>
    update.mutate({ body: { theme: isTheme(value) ? value : null } })

  return (
    <div className="flex flex-col gap-3">
      <FormField label={t`Interface theme`} hint={t`Saved on your account.`}>
        {(control) => (
          <NativeSelect
            {...control}
            value={account.theme ?? SYSTEM}
            disabled={update.isPending}
            onChange={(event) => change(event.target.value)}
          >
            <NativeSelectOption value={SYSTEM}>{t`The system's theme`}</NativeSelectOption>
            <NativeSelectOption value="light">{t`Light`}</NativeSelectOption>
            <NativeSelectOption value="dark">{t`Dark`}</NativeSelectOption>
          </NativeSelect>
        )}
      </FormField>
    </div>
  )
}
