import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Membership } from '@opos/contract'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setMemberships } from '../model/permissions'
import { TenantPickerPage } from './tenant-picker-page'

const membership = (slug: string, name: string, fields: Partial<Membership> = {}): Membership => ({
  tenant: { id: `tenant-${slug}`, slug, name, suspended: false },
  role: 'org',
  settingsAccess: 'none',
  brandingAccess: 'none',
  shopConfigAccess: 'none',
  expiresAt: null,
  editions: [],
  ...fields,
})

const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<TenantPickerPage />} />
          <Route path="/:tenantSlug/*" element={<p>inside the convention</p>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )

const card = (name: string) =>
  screen.getAllByRole('listitem').find((item) => within(item).queryByText(name))!

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(() => {
  cleanup()
  setMemberships(null)
})

describe('TenantPickerPage', () => {
  it('goes straight into the only convention, a head organizer included', () => {
    setMemberships([membership('convention-a', 'Convention A', { role: 'head' })])
    view()

    expect(screen.getByText('inside the convention')).toBeDefined()
  })

  it('lets a member of several conventions choose, with the settings only where they may open them', () => {
    setMemberships([
      membership('convention-a', 'Convention A', { role: 'head' }),
      membership('convention-b', 'Convention B'),
    ])
    view()

    const a = card('Convention A')
    expect(
      within(a)
        .getByRole('link', { name: /Convention A/ })
        .getAttribute('href'),
    ).toBe('/convention-a')
    expect(within(a).getByRole('link', { name: 'Convention settings' }).getAttribute('href')).toBe(
      '/convention-a/settings',
    )

    const b = card('Convention B')
    expect(
      within(b)
        .getByRole('link', { name: /Convention B/ })
        .getAttribute('href'),
    ).toBe('/convention-b')
    expect(within(b).queryByRole('link', { name: 'Convention settings' })).toBeNull()
    expect(document.title).toBe('Your conventions · OPOS panel')
  })

  // The admin took the convention off the platform: the member sees that where their conventions
  // are listed, and nothing of it opens but that message.
  it('marks a suspended convention and offers no settings of it', () => {
    setMemberships([
      membership('convention-a', 'Convention A', { role: 'head' }),
      membership('convention-b', 'Convention B', {
        role: 'head',
        tenant: { id: 'tenant-b', slug: 'convention-b', name: 'Convention B', suspended: true },
      }),
    ])
    view()

    const b = card('Convention B')
    expect(within(b).getByText('Suspended')).toBeDefined()
    expect(within(b).queryByRole('link', { name: 'Convention settings' })).toBeNull()
    expect(
      within(b)
        .getByRole('link', { name: /Convention B/ })
        .getAttribute('href'),
    ).toBe('/convention-b')
    expect(within(card('Convention A')).queryByText('Suspended')).toBeNull()
    expect(
      within(card('Convention A')).getByRole('link', { name: 'Convention settings' }),
    ).toBeDefined()
  })

  it('says so when the account is in no team', () => {
    setMemberships([])
    view()

    expect(
      screen.getByText(
        "You are not in any convention's team. A convention's organizers can invite you by email.",
      ),
    ).toBeDefined()
  })
})
