import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, renderHook } from '@testing-library/react'
import { type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useMoney } from './use-money'

const money = (locale: string) => {
  i18n.load(locale, {})
  i18n.activate(locale)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>{children}</I18nProvider>
  )
  return renderHook(() => useMoney(), { wrapper }).result.current
}
/** An amount with the spaces a language writes in it, breaking or not, as plain ones. */
const plain = (amount: string) => amount.replace(/\s/g, ' ')

afterEach(cleanup)

describe('useMoney', () => {
  it('writes an amount of the shop in the interface language, whole and short', () => {
    const polish = money('pl')

    expect(plain(polish.format(1250000))).toBe('12 500,00 zł')
    // For the axis of a chart, which has no room for every digit.
    expect(plain(polish.short(1250000))).toBe('12,5 tys. zł')
    expect(plain(money('en').short(1250000))).toBe('PLN 12.5K')
  })

  it('reads and writes the amount of a field', () => {
    const polish = money('pl')

    expect(polish.toInput(1250)).toBe('12,50')
    expect(polish.parse('12,5')).toBe(1250)
  })
})
