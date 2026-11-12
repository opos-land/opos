import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { currentChoice, decideConsent } from '../model/consent'
import { type ConsentCategory, type Tracker } from '../model/tracker'
import { ConsentBanner } from './consent-banner'

const listed = vi.hoisted(() => [] as Tracker[])
vi.mock('../trackers', () => ({ TRACKERS: listed }))
vi.mock('../model/reload', () => ({ reloadPage: vi.fn() }))

const tracker = (id: string, category: ConsentCategory, vendor: string): Tracker => ({
  id,
  category,
  vendor,
  purpose: { id: `purpose of ${id}`, message: `What ${vendor} does.` },
  load: vi.fn(),
})

const list = (...trackers: Tracker[]) => listed.splice(0, listed.length, ...trackers)

const view = () => {
  const rendered = render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ConsentBanner />
      </MemoryRouter>
    </I18nProvider>,
  )
  return { ...rendered, user: userEvent.setup() }
}

const banner = () => screen.queryByRole('region', { name: 'Optional tools' })

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(() => {
  cleanup()
  list()
  window.localStorage.clear()
})

describe('ConsentBanner', () => {
  it('shows nothing while no tracker is listed', () => {
    const { container } = view()
    expect(container.textContent).toBe('')
  })

  it('asks on the first visit, naming each category with its providers, and starts nothing', () => {
    const counter = tracker('counter', 'analytics', 'Counter')
    const pixel = tracker('pixel', 'marketing', 'Pixel')
    list(counter, pixel)
    view()

    const region = banner()!
    expect(within(region).getByText('Counter')).toBeTruthy()
    expect(within(region).getByText('Pixel')).toBeTruthy()
    expect(within(region).getByText('Analytics:')).toBeTruthy()
    expect(within(region).getByText('Marketing:')).toBeTruthy()
    expect(counter.load).not.toHaveBeenCalled()
    expect(pixel.load).not.toHaveBeenCalled()
  })

  it('offers refusing all as prominently as allowing all', () => {
    list(tracker('counter', 'analytics', 'Counter'))
    view()

    const allow = screen.getByRole('button', { name: 'Allow all' })
    const refuse = screen.getByRole('button', { name: 'Refuse all' })
    expect(refuse.className).toBe(allow.className)
  })

  it('allows every category at once', async () => {
    const counter = tracker('counter', 'analytics', 'Counter')
    const pixel = tracker('pixel', 'marketing', 'Pixel')
    list(counter, pixel)
    const { user } = view()

    await user.click(screen.getByRole('button', { name: 'Allow all' }))

    expect(banner()).toBeNull()
    expect(currentChoice()).toEqual(['analytics', 'marketing'])
    expect(counter.load).toHaveBeenCalledOnce()
    expect(pixel.load).toHaveBeenCalledOnce()
  })

  it('refuses every category at once', async () => {
    const counter = tracker('counter', 'analytics', 'Counter')
    list(counter)
    const { user } = view()

    await user.click(screen.getByRole('button', { name: 'Refuse all' }))

    expect(banner()).toBeNull()
    expect(currentChoice()).toEqual([])
    expect(counter.load).not.toHaveBeenCalled()
  })

  it('lets the visitor choose per category, with nothing allowed beforehand', async () => {
    const counter = tracker('counter', 'analytics', 'Counter')
    const pixel = tracker('pixel', 'marketing', 'Pixel')
    list(counter, pixel)
    const { user } = view()

    await user.click(screen.getByRole('button', { name: 'Customize' }))
    const settings = await screen.findByRole('dialog', { name: 'Privacy settings' })
    expect(within(settings).getByText('What Counter does.')).toBeTruthy()
    const analytics = within(settings).getByRole('switch', { name: 'Analytics' })
    const marketing = within(settings).getByRole('switch', { name: 'Marketing' })
    expect(analytics.getAttribute('aria-checked')).toBe('false')
    expect(marketing.getAttribute('aria-checked')).toBe('false')

    await user.click(analytics)
    await user.click(within(settings).getByRole('button', { name: 'Save my choice' }))

    expect(currentChoice()).toEqual(['analytics'])
    expect(counter.load).toHaveBeenCalledOnce()
    expect(pixel.load).not.toHaveBeenCalled()
    expect(banner()).toBeNull()
  })

  // A later page load lists new tracker objects, none of them started yet.
  it('stays away once the visitor chose, and starts on a later page what was allowed', () => {
    list(tracker('counter', 'analytics', 'Counter'))
    decideConsent(['analytics'])
    const counter = tracker('counter', 'analytics', 'Counter')
    list(counter)

    view()

    expect(banner()).toBeNull()
    expect(counter.load).toHaveBeenCalledOnce()
  })

  it('asks again, and starts nothing, once a new tracker is listed', () => {
    list(tracker('counter', 'analytics', 'Counter'))
    decideConsent(['analytics'])
    const counter = tracker('counter', 'analytics', 'Counter')
    list(counter, tracker('pixel', 'marketing', 'Pixel'))

    view()

    expect(banner()).not.toBeNull()
    expect(counter.load).not.toHaveBeenCalled()
  })
})
