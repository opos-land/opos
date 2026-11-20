import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import { productionNumbersColumns } from './exports'

// The columns of the files an org exports, in the language of the account that asked.
describe('the columns of the production numbers', () => {
  const said = async (locale: 'en' | 'pl') => {
    const i18n = setupI18n()
    await activateLocale(i18n, locale)
    return Object.values(productionNumbersColumns).map((column) => i18n._(column))
  }

  it('name the item, the variant and the three counts', async () => {
    expect(Object.keys(productionNumbersColumns)).toEqual([
      'item',
      'variant',
      'paid',
      'awaitingPayment',
      'needsReview',
    ])
    expect(await said('en')).toEqual([
      'Merchandise item',
      'Variant',
      'Paid',
      'Awaiting payment',
      'Needs review',
    ])
  })

  it('are said in Polish with the glossary renderings', async () => {
    expect(await said('pl')).toEqual([
      'Gadżet',
      'Wariant',
      'Opłacone',
      'Oczekujące na płatność',
      'Do wyjaśnienia',
    ])
  })
})
