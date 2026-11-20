import { useLingui } from '@lingui/react/macro'
import { SHOP_CURRENCY } from '@opos/contract'
import { formatMoney, formatMoneyShort, isLocale, moneyInput, parseMoney } from '@opos/i18n'

/**
 * Amounts of the shop in the interface language: every price is a gross amount in the
 * convention's one currency, held in its minor unit.
 */
export function useMoney() {
  const { i18n } = useLingui()
  const locale = isLocale(i18n.locale) ? i18n.locale : 'en'
  return {
    currency: SHOP_CURRENCY,
    /** An amount with its currency, as a page shows it. */
    format: (amountMinor: number) => formatMoney(amountMinor, SHOP_CURRENCY, locale),
    /** An amount written short, where there is no room for every digit. */
    short: (amountMinor: number) => formatMoneyShort(amountMinor, SHOP_CURRENCY, locale),
    /** An amount as a field holds it. */
    toInput: (amountMinor: number) => moneyInput(amountMinor, locale),
    /** The amount a person typed, or null. */
    parse: parseMoney,
  }
}
