import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { currentChoice, decideConsent } from '../model/consent'
import { reloadPage } from '../model/reload'
import { type ConsentCategory, type Tracker } from '../model/tracker'
import { ConsentSettingsLink } from './consent-settings-link'

const listed = vi.hoisted(() => [] as Tracker[])
vi.mock('../trackers', () => ({ TRACKERS: listed }))
vi.mock('../model/reload', () => ({ reloadPage: vi.fn() }))

const tracker = (id: string, category: ConsentCategory): Tracker => ({
  id,
  category,
  vendor: id,
  purpose: { id: `purpose of ${id}` },
  load: vi.fn(),
})

const list = (...trackers: Tracker[]) => listed.splice(0, listed.length, ...trackers)

const view = () => {
  const rendered = render(
    <I18nProvider i18n={i18n}>
      <ConsentSettingsLink />
    </I18nProvider>,
  )
  return { ...rendered, user: userEvent.setup() }
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(() => {
  cleanup()
  list()
  window.localStorage.clear()
  vi.mocked(reloadPage).mockClear()
})

describe('ConsentSettingsLink', () => {
  it('is absent while no tracker is listed', () => {
    const { container } = view()
    expect(container.textContent).toBe('')
  })

  it('opens the privacy settings on the current choice', async () => {
    list(tracker('counter', 'analytics'), tracker('pixel', 'marketing'))
    decideConsent(['analytics'])
    const { user } = view()

    await user.click(screen.getByRole('button', { name: 'Privacy settings' }))

    const settings = await screen.findByRole('dialog', { name: 'Privacy settings' })
    const analytics = within(settings).getByRole('switch', { name: 'Analytics' })
    const marketing = within(settings).getByRole('switch', { name: 'Marketing' })
    expect(analytics.getAttribute('aria-checked')).toBe('true')
    expect(marketing.getAttribute('aria-checked')).toBe('false')
  })

  it('withdraws a consent as easily as it was given, which stops its tracker', async () => {
    const counter = tracker('counter', 'analytics')
    list(counter)
    decideConsent(['analytics'])
    expect(counter.load).toHaveBeenCalledOnce()
    const { user } = view()

    await user.click(screen.getByRole('button', { name: 'Privacy settings' }))
    const settings = await screen.findByRole('dialog', { name: 'Privacy settings' })
    await user.click(within(settings).getByRole('button', { name: 'Refuse all' }))

    expect(currentChoice()).toEqual([])
    expect(reloadPage).toHaveBeenCalledOnce()
  })
})
