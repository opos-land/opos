import { describe, expect, it } from 'vitest'
import { formatDateTime, formatMoney, formatMoneyShort, moneyInput, parseMoney } from './format'

describe('formatDateTime', () => {
  it('formats in the given time zone', () => {
    const at = new Date('2026-06-01T22:30:00Z')

    expect(formatDateTime(at, 'pl', 'Europe/Warsaw', { hour: '2-digit', minute: '2-digit' })).toBe(
      '00:30',
    )
  })
})

describe('formatMoney', () => {
  it('formats minor units as currency', () => {
    expect(formatMoney(12000, 'PLN', 'pl').replace(/\s/g, ' ')).toBe('120,00 zł')
  })
})

describe('formatMoneyShort', () => {
  // The axis of a chart has no room for every digit: thousands and millions are named.
  it('writes minor units short, as the language names thousands and millions', () => {
    const short = (amountMinor: number, locale: 'pl' | 'en') =>
      formatMoneyShort(amountMinor, 'PLN', locale).replace(/\s/g, ' ')

    expect(short(1250000, 'pl')).toBe('12,5 tys. zł')
    expect(short(123456789, 'pl')).toBe('1,2 mln zł')
    expect(short(1250000, 'en')).toBe('PLN 12.5K')
  })

  it('writes a small amount in whole units, and nothing as zero', () => {
    expect(formatMoneyShort(12000, 'PLN', 'pl').replace(/\s/g, ' ')).toBe('120 zł')
    expect(formatMoneyShort(0, 'PLN', 'pl').replace(/\s/g, ' ')).toBe('0 zł')
  })
})

describe('parseMoney', () => {
  it.each([
    ['120', 12000],
    ['120,5', 12050],
    ['120.50', 12050],
    [' 1 200,00 ', 120000],
    ['1\u00a0200,99', 120099],
    ['0', 0],
    ['0,01', 1],
    ['.5', 50],
  ])('reads %j as an amount of minor units', (text, minor) => {
    expect(parseMoney(text)).toBe(minor)
  })

  it.each([
    ['nothing', ''],
    ['words', 'free'],
    ['a negative amount', '-5'],
    ['more than two decimals', '1,005'],
    ['two separators', '1.200,00'],
    ['a separator alone', ','],
    ['an exponent', '1e3'],
    ['an amount no whole number of minor units holds', '90071992547409.93'],
  ])('reads %s as no amount', (_, text) => {
    expect(parseMoney(text)).toBeNull()
  })

  // A float would lose a minor unit here: 1.15 * 100 is 114.99999999999999.
  it('keeps every minor unit of the text', () => {
    expect(parseMoney('1,15')).toBe(115)
    expect(parseMoney('4.35')).toBe(435)
    expect(parseMoney('1000000,00')).toBe(100000000)
  })
})

describe('moneyInput', () => {
  it('writes an amount as a field holds it, with the decimal mark of the language', () => {
    expect(moneyInput(12050, 'pl')).toBe('120,50')
    expect(moneyInput(12050, 'en')).toBe('120.50')
    expect(moneyInput(0, 'pl')).toBe('0,00')
    expect(moneyInput(120000, 'en')).toBe('1200.00')
  })

  it('is read back as the amount it was written from', () => {
    for (const amount of [0, 1, 99, 115, 435, 12050, 100000000]) {
      expect(parseMoney(moneyInput(amount, 'pl'))).toBe(amount)
      expect(parseMoney(moneyInput(amount, 'en'))).toBe(amount)
    }
  })
})
