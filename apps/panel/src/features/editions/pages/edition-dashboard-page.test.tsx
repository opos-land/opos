import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Edition } from '@opos/contract'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionDashboardPage } from './edition-dashboard-page'

const state = vi.hoisted(() => ({ edition: undefined as Edition | undefined }))

vi.mock('../hooks/use-editions', () => ({
  useEditionBySlug: () => ({
    isPending: false,
    isError: false,
    error: null,
    edition: state.edition,
  }),
}))
vi.mock('../../tenants', () => ({
  useCurrentTenant: () => ({ tenant: { slug: 'convention-a', name: 'Convention A' } }),
  useTenantTime: () => ({ range: () => 'the dates of the edition' }),
}))

const edition: Edition = {
  id: 'edition-1',
  slug: '2026',
  name: 'Edition 2026',
  startsAt: '2026-06-05T08:00:00.000Z',
  endsAt: '2026-06-07T16:00:00.000Z',
  isActive: true,
  isPublished: false,
}

const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/convention-a/editions/2026']}>
        <Routes>
          <Route path="/:tenantSlug/editions/:editionSlug" element={<EditionDashboardPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.edition = edition
})

afterEach(cleanup)

describe('EditionDashboardPage', () => {
  it('shows the edition, its dates and whether it is active and published', () => {
    view()

    expect(screen.getByRole('heading', { name: 'Edition 2026', level: 1 })).toBeDefined()
    expect(screen.getByText('the dates of the edition')).toBeDefined()
    expect(screen.getByText("This is the convention's active edition.")).toBeDefined()
    expect(
      screen.getByText('The edition is not published: the portal does not show it.'),
    ).toBeDefined()
    expect(document.title).toBe('Edition 2026 · OPOS panel')
  })

  it('says when the edition is not the active one', () => {
    state.edition = { ...edition, isActive: false, isPublished: true }
    view()

    expect(screen.getByText("This edition is not the convention's active one.")).toBeDefined()
    expect(
      screen.getByText('The edition is published: the portal shows it to everyone.'),
    ).toBeDefined()
  })

  it('is closed for an edition the member does not see', () => {
    state.edition = undefined
    view()

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
  })
})
