import { setupI18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import {
  exportNames,
  paymentColumns,
  pickListColumns,
  productionNumbersColumns,
  ticketHolderColumns,
} from './exports'

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

  // "Paid" alone is also the moment an order was paid, said another way in Polish: the counts
  // carry a context, the one the panel's own table of the numbers uses.
  it('name the three counts under the context of the production numbers', () => {
    const { paid, awaitingPayment, needsReview } = productionNumbersColumns

    expect(paid.id).toBe(msg({ message: 'Paid', context: 'production numbers' }).id)
    expect(paid.id).not.toBe(msg`Paid`.id)
    expect(awaitingPayment.id).not.toBe(msg`Awaiting payment`.id)
    expect(needsReview.id).not.toBe(msg`Needs review`.id)
  })
})

// docs/specs/0010-sales-reports.md, E2-E4: the three lists an org takes away as files.
describe('the columns of the lists of an edition’s sales', () => {
  const said = async (columns: object, locale: 'en' | 'pl') => {
    const i18n = setupI18n()
    await activateLocale(i18n, locale)
    return Object.values(columns).map((column) => i18n._(column as never))
  }

  it('name what the ticket holder list holds, beside the edition’s own custom fields', async () => {
    expect(await said(ticketHolderColumns, 'en')).toEqual([
      'Order number',
      'Status',
      'Ticket holder',
      'Age band',
      'Ticket type',
      'Add-ons',
      'Email',
      'Placed',
    ])
    expect(await said(ticketHolderColumns, 'pl')).toEqual([
      'Numer zamówienia',
      'Status',
      'Posiadacz akredytacji',
      'Przedział wiekowy',
      'Rodzaj akredytacji',
      'Dodatki',
      'E-mail',
      'Złożono',
    ])
  })

  it('name what the merchandise pick list and the payments list hold', async () => {
    expect(await said(pickListColumns, 'en')).toEqual([
      'Order number',
      'Name',
      'Merchandise item',
      'Variant',
      'Quantity',
      'Handed out',
    ])
    expect(await said(pickListColumns, 'pl')).toEqual([
      'Numer zamówienia',
      'Imię lub pseudonim',
      'Gadżet',
      'Wariant',
      'Liczba',
      'Wydano',
    ])
    expect(await said(paymentColumns, 'en')).toEqual([
      'Order number',
      'Provider',
      'Attempt',
      'Amount',
      'Paid amount',
      'Currency',
      'Paid',
      'Money',
      'Transaction number',
      'Payout batch',
      'Commission',
      'Other details',
    ])
    expect(await said(paymentColumns, 'pl')).toEqual([
      'Numer zamówienia',
      'Dostawca',
      'Próba płatności',
      'Kwota',
      'Zapłacona kwota',
      'Waluta',
      'Zapłacono',
      'Pieniądze',
      'Numer transakcji',
      'Numer paczki wypłat',
      'Prowizja',
      'Inne szczegóły',
    ])
  })

  it('say a status, an age band, an attempt and where the money is as the panel says them', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')
    const pl = (names: Record<string, never>) => Object.values(names).map((name) => i18n._(name))

    expect(pl(exportNames.orderStatus as never)).toEqual([
      'Oczekuje na płatność',
      'Opłacone',
      'Opłacone ręcznie',
      'Wygasłe',
      'Do wyjaśnienia',
      'Odrzucone',
      'Anulowane',
    ])
    expect(pl(exportNames.ageBand as never)).toEqual(['Dziecko', 'Nastolatek', 'Dorosły'])
    expect(pl(exportNames.attemptStatus as never)).toEqual([
      'Rozpoczęta',
      'Opłacona',
      'Nieudana',
      'Zakończona',
      'Odrzucona',
    ])
    expect(pl(exportNames.moneyWith as never)).toEqual(['U konwentu', 'U kupującego'])
    await activateLocale(i18n, 'en')
    expect(i18n._(exportNames.orderStatus['paid-manual'])).toBe('Paid - manual')
    expect(i18n._(exportNames.attemptStatus.refused)).toBe('Refused')
  })
})
