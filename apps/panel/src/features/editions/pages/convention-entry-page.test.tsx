import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Edition } from '@opos/contract'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConventionEntryPage } from './convention-entry-page'

const state = vi.hoisted(() => ({
  editions: [] as Edition[],
  pending: false,
  conventionSettings: false,
}))

vi.mock('../hooks/use-editions', () => ({
  useEditions: () => ({
    data: state.pending ? undefined : state.editions,
    isPending: state.pending,
    isError: false,
    error: null,
  }),
}))
vi.mock('../../tenants', () => ({
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: { seesConventionSettings: state.conventionSettings },
  }),
}))

const edition = (slug: string, isActive = false): Edition => ({
  id: `edition-${slug}`,
  slug,
  name: `Edition ${slug}`,
  startsAt: '2026-06-05T08:00:00.000Z',
  endsAt: '2026-06-07T16:00:00.000Z',
  isActive,
  isPublished: false,
})

function Location() {
  return <output aria-label="location">{useLocation().pathname}</output>
}

const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/convention-a']}>
        <Routes>
          <Route path="/:tenantSlug" element={<ConventionEntryPage />} />
          <Route path="*" element={null} />
        </Routes>
        <Location />
      </MemoryRouter>
    </I18nProvider>,
  )

const location = () => screen.getByRole('status', { name: 'location' }).textContent

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.editions = []
  state.pending = false
  state.conventionSettings = false
})

afterEach(cleanup)

describe('ConventionEntryPage', () => {
  it("opens the member's edition: the active one when it is among those they see", () => {
    state.editions = [edition('2027'), edition('2026', true)]
    view()

    expect(location()).toBe('/convention-a/editions/2026')
  })

  it('opens the editions of the convention settings when there is no edition yet to work in', () => {
    state.conventionSettings = true
    view()

    expect(location()).toBe('/convention-a/settings/editions')
  })

  it('tells a member who sees no edition and no settings that there is nothing yet', () => {
    view()

    expect(location()).toBe('/convention-a')
    expect(
      screen.getByText(
        'You have no access to any edition of this convention yet. A head organizer can give it to you.',
      ),
    ).toBeDefined()
    expect(document.title).toBe('Convention A · OPOS panel')
  })

  it('waits for the editions before choosing', () => {
    state.pending = true
    view()

    expect(location()).toBe('/convention-a')
    expect(screen.getByText('Loading…')).toBeDefined()
  })
})
