import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { isLocale, type Locale, SUPPORTED_LOCALES } from '@opos/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  accountLocale,
  chooseSignedOutLocale,
  languageName,
  loadLocale,
} from '../../../shared/lib/i18n'
import { useSession } from '../../../shared/lib/session'
import { NativeSelect, NativeSelectOption } from '../../../shared/ui'
import { mergeSavedLanguage, saveLanguageOptions } from '../api/language'

/** The select itself: the language on screen, each language named in itself, and a choice of another. */
function LanguageSelect({
  onChoose,
  disabled = false,
}: {
  onChoose: (locale: Locale) => void
  disabled?: boolean
}) {
  const { t, i18n } = useLingui()
  const label = t`Language`

  return (
    <NativeSelect
      size="sm"
      aria-label={label}
      title={label}
      value={i18n.locale}
      disabled={disabled}
      onChange={(event) => {
        if (isLocale(event.target.value)) onChoose(event.target.value)
      }}
    >
      {SUPPORTED_LOCALES.map((locale) => (
        <NativeSelectOption key={locale} value={locale} lang={locale}>
          {languageName(locale)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

/** A signed-in account keeps the language on the account. */
function AccountSelect() {
  const queryClient = useQueryClient()
  const save = useMutation({
    ...saveLanguageOptions(),
    meta: { success: msg`The interface language is saved.` },
    onSuccess: async (saved) => {
      mergeSavedLanguage(queryClient, saved)
      await loadLocale(accountLocale(saved.locale))
    },
  })

  return (
    <LanguageSelect
      onChoose={(locale) => save.mutate({ body: { locale } })}
      disabled={save.isPending}
    />
  )
}

/**
 * Switches the interface language on any screen, signed in or not: on the account when one is
 * signed in, else in this browser. With no choice, the interface is in Polish.
 */
export function LanguageSwitcher() {
  const status = useSession((state) => state.status)
  const signedIn = useSession((state) => state.account !== null)

  if (signedIn) return <AccountSelect />
  return (
    <LanguageSelect
      onChoose={(locale) => void chooseSignedOutLocale(locale)}
      disabled={status === 'loading'}
    />
  )
}
