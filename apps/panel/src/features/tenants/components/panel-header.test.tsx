import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Membership } from '@opos/contract'
import { cleanup, render, screen } from '@testing-library/react'
import { type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setMemberships } from '../model/permissions'
import { PanelHeader } from './panel-header'

vi.mock('../../account', () => ({ AccountMenu: () => null }))

const membership = (slug: string, name: string): Membership => ({
  tenant: { id: `tenant-${slug}`, slug, name },
  role: 'org',
  settingsAccess: 'none',
  brandingAccess: 'none',
  shopConfigAccess: 'none',
  expiresAt: null,
  editions: [],
})

const view = (
  path: string,
  conventionSettings: boolean,
  editionSwitch?: ReactNode,
  seesAnEdition = true,
) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/:tenantSlug/*"
            element={
              <PanelHeader
                tenantSlug="convention-a"
                conventionSettings={conventionSettings}
                editionSwitch={editionSwitch}
                seesAnEdition={seesAnEdition}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(() => {
  cleanup()
  setMemberships(null)
})

describe('PanelHeader', () => {
  it('names the only convention instead of offering a switch', () => {
    setMemberships([membership('convention-a', 'Convention A')])
    view('/convention-a/editions/2026', false)

    expect(screen.getByText('Convention A')).toBeDefined()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('offers a switch between conventions to a member of several', () => {
    setMemberships([
      membership('convention-a', 'Convention A'),
      membership('convention-b', 'Convention B'),
    ])
    view('/convention-a/editions/2026', false)

    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Convention' }).value).toBe(
      'convention-a',
    )
  })

  it('shows the edition switch it is given beside the convention', () => {
    setMemberships([membership('convention-a', 'Convention A')])
    view('/convention-a/editions/2026', false, <span>the edition switch</span>)

    const bar = screen.getByRole('banner')
    expect(bar.textContent).toMatch(/Convention A.*the edition switch/)
  })

  it('leads from an edition to the convention settings of a member who may open them', () => {
    setMemberships([membership('convention-a', 'Convention A')])
    view('/convention-a/editions/2026', true)

    const link = screen.getByRole('link', { name: 'Convention settings' })
    expect(link.getAttribute('href')).toBe('/convention-a/settings')
    expect(screen.queryByRole('link', { name: 'Back to the edition' })).toBeNull()
  })

  it('leads from the convention settings back to the edition', () => {
    setMemberships([membership('convention-a', 'Convention A')])
    view('/convention-a/settings/team', true)

    const link = screen.getByRole('link', { name: 'Back to the edition' })
    expect(link.getAttribute('href')).toBe('/convention-a')
    expect(screen.queryByRole('link', { name: 'Convention settings' })).toBeNull()
  })

  it('offers no way back from the convention settings while there is no edition to go to', () => {
    setMemberships([membership('convention-a', 'Convention A')])
    view('/convention-a/settings/editions', true, undefined, false)

    expect(screen.queryByRole('link', { name: 'Back to the edition' })).toBeNull()
  })

  it('never mentions the convention settings to a member who may not open them', () => {
    setMemberships([membership('convention-a', 'Convention A')])
    view('/convention-a/editions/2026', false)

    expect(screen.queryByRole('link', { name: 'Convention settings' })).toBeNull()
  })
})
