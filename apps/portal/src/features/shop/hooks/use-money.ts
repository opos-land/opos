import { useLingui } from '@lingui/react'
import { formatMoney, isLocale } from '@opos/i18n'
import { activeLocale } from '../../../shared/lib/i18n'

/** An amount in minor units, written in the language of the page with its currency. */
export function useMoney(currency: string) {
  const { i18n } = useLingui()
  const locale = isLocale(i18n.locale) ? i18n.locale : activeLocale()
  return (amountMinor: number) => formatMoney(amountMinor, currency, locale)
}

/** A sentence a provider's module gives, in the language of the page where it has it. */
export function useSentence() {
  const { i18n } = useLingui()
  return (sentence: Readonly<Record<string, string>>) =>
    sentence[i18n.locale] ?? sentence.en ?? Object.values(sentence)[0] ?? ''
}
