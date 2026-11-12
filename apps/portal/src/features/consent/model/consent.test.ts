import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyConsent,
  CONSENT_STORAGE_KEY,
  currentChoice,
  decideConsent,
  offeredCategories,
} from './consent'
import { reloadPage } from './reload'
import { type ConsentCategory, type Tracker } from './tracker'

const listed = vi.hoisted(() => [] as Tracker[])
vi.mock('../trackers', () => ({ TRACKERS: listed }))
vi.mock('./reload', () => ({ reloadPage: vi.fn() }))

const tracker = (id: string, category: ConsentCategory, cookies: string[] = []): Tracker => ({
  id,
  category,
  vendor: id,
  purpose: { id: `purpose of ${id}` },
  cookies,
  load: vi.fn(),
})

const list = (...trackers: Tracker[]) => listed.splice(0, listed.length, ...trackers)

beforeEach(() => {
  vi.mocked(reloadPage).mockClear()
})

afterEach(() => {
  list()
  window.localStorage.clear()
  vi.useRealTimers()
})

describe('offeredCategories', () => {
  it('names the categories of the listed trackers once each, in their order', () => {
    list(
      tracker('pixel', 'marketing'),
      tracker('counter', 'analytics'),
      tracker('other', 'marketing'),
    )
    expect(offeredCategories()).toEqual(['analytics', 'marketing'])

    list(tracker('counter', 'analytics'))
    expect(offeredCategories()).toEqual(['analytics'])

    list()
    expect(offeredCategories()).toEqual([])
  })
})

describe('currentChoice', () => {
  it('holds none until the visitor decides', () => {
    list(tracker('counter', 'analytics'))
    expect(currentChoice()).toBeNull()
  })

  it('keeps the choice in this browser with the trackers it was asked for and its date', () => {
    list(tracker('counter', 'analytics'), tracker('pixel', 'marketing'))
    decideConsent(['analytics'])

    expect(currentChoice()).toEqual(['analytics'])
    const stored = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY)!) as {
      offered: string[]
      granted: string[]
      decidedAt: string
    }
    expect(stored.offered).toEqual(['counter', 'pixel'])
    expect(stored.granted).toEqual(['analytics'])
    expect(Number.isNaN(Date.parse(stored.decidedAt))).toBe(false)
  })

  it('asks again once a tracker the choice was not asked for is listed', () => {
    list(tracker('counter', 'analytics'))
    decideConsent(['analytics'])

    list(tracker('counter', 'analytics'), tracker('another', 'analytics'))
    expect(currentChoice()).toBeNull()
  })

  it('keeps the choice when a tracker leaves the list', () => {
    list(tracker('counter', 'analytics'), tracker('pixel', 'marketing'))
    decideConsent(['analytics', 'marketing'])

    list(tracker('counter', 'analytics'))
    expect(currentChoice()).toEqual(['analytics', 'marketing'])
  })

  it('asks again twelve months after the choice', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 0, 15, 10))
    list(tracker('counter', 'analytics'))
    decideConsent([])

    vi.setSystemTime(new Date(2027, 0, 15, 9, 59))
    expect(currentChoice()).toEqual([])
    vi.setSystemTime(new Date(2027, 0, 15, 10))
    expect(currentChoice()).toBeNull()
  })

  it('takes a stored choice it cannot read for none', () => {
    list(tracker('counter', 'analytics'))
    for (const stored of [
      'not json',
      '{"offered":["counter"],"granted":"analytics","decidedAt":"2026-11-12T10:00:00.000Z"}',
      '{"offered":["counter"],"granted":["everything"],"decidedAt":"2026-11-12T10:00:00.000Z"}',
      '{"offered":["counter"],"granted":[],"decidedAt":"yesterday"}',
    ]) {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, stored)
      expect(currentChoice()).toBeNull()
    }
  })

  it('answers the same choice while it does not change', () => {
    list(tracker('counter', 'analytics'))
    decideConsent(['analytics'])
    expect(currentChoice()).toBe(currentChoice())
  })
})

describe('applyConsent', () => {
  it('starts the trackers of the allowed categories, once a page load', () => {
    const counter = tracker('counter', 'analytics')
    const pixel = tracker('pixel', 'marketing')
    list(counter, pixel)

    applyConsent(['analytics'])
    applyConsent(['analytics'])

    expect(counter.load).toHaveBeenCalledOnce()
    expect(pixel.load).not.toHaveBeenCalled()
  })

  it('starts nothing without a choice', () => {
    const counter = tracker('counter', 'analytics')
    list(counter)

    applyConsent(null)

    expect(counter.load).not.toHaveBeenCalled()
  })

  it('removes the cookies of a started tracker whose consent is withdrawn, and reloads the page', () => {
    list(tracker('counter', 'analytics', ['_counter']))
    applyConsent(['analytics'])
    document.cookie = '_counter=1; path=/'
    document.cookie = 'kept=1; path=/'

    applyConsent([])

    expect(document.cookie).not.toMatch(/_counter=/)
    expect(document.cookie).toMatch(/kept=1/)
    expect(reloadPage).toHaveBeenCalledOnce()
    document.cookie = 'kept=; max-age=0; path=/'
  })

  it('reloads nothing when a refused tracker never started', () => {
    list(tracker('counter', 'analytics'))

    applyConsent([])

    expect(reloadPage).not.toHaveBeenCalled()
  })

  it('applies a decision at once', () => {
    const counter = tracker('counter', 'analytics')
    list(counter)

    decideConsent(['analytics'])
    expect(counter.load).toHaveBeenCalledOnce()

    decideConsent([])
    expect(reloadPage).toHaveBeenCalledOnce()
  })
})
