import { describe, expect, it } from 'vitest'
import { formatDateTime, formatMoney } from './format'

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
