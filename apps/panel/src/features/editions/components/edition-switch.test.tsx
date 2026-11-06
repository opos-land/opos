import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Edition } from '@opos/contract'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionSwitch } from './edition-switch'

const state = vi.hoisted(() => ({ editions: [] as Edition[] }))

vi.mock('../hooks/use-editions', () => ({
  useEditionBySlug: (slug: string | undefined) => ({
    data: state.editions,
    isPending: false,
    isError: false,
    error: null,
    edition: state.editions.find((edition) => edition.slug === slug),
  }),
}))
vi.mock('../../tenants', () => ({
  useCurrentTenant: () => ({ tenant: { slug: 'convention-a', name: 'Convention A' } }),
}))

const edition = (slug: string, name: string): Edition => ({
  id: `edition-${slug}`,
  slug,
  name,
  startsAt: '2026-06-05T08:00:00.000Z',
  endsAt: '2026-06-07T16:00:00.000Z',
  isActive: false,
  isPublished: false,
})

function Location() {
  return <output aria-label="location">{useLocation().pathname}</output>
}

// The switch sits in the top bar, above every route of the tenant, so it reads the edition from
// the address itself.
const view = (path: string) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:tenantSlug/*" element={<EditionSwitch />} />
        </Routes>
        <Location />
      </MemoryRouter>
    </I18nProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.editions = [edition('2027', 'Edition 2027'), edition('2026', 'Edition 2026')]
})

afterEach(cleanup)

describe('EditionSwitch', () => {
  it('switches to another edition the member sees, on its dashboard', () => {
    view('/convention-a/editions/2026/program')

    const switcher = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Edition' })
    expect(switcher.value).toBe('2026')
    expect(
      within(switcher)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Edition 2027', 'Edition 2026'])

    fireEvent.change(switcher, { target: { value: '2027' } })

    expect(screen.getByRole('status', { name: 'location' }).textContent).toBe(
      '/convention-a/editions/2027',
    )
  })

  it('names the only edition the member sees, under the same label, instead of offering a switch', () => {
    state.editions = [edition('2026', 'Edition 2026')]
    view('/convention-a/editions/2026')

    expect(screen.queryByRole('combobox')).toBeNull()
    const named = screen.getByText('Edition 2026')
    expect(named.parentElement?.textContent).toBe('EditionEdition 2026')
  })

  it('shows nothing outside an edition, in the convention settings', () => {
    view('/convention-a/settings/team')

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByText(/Edition 20/)).toBeNull()
  })

  it('shows nothing for an edition the member does not see', () => {
    view('/convention-a/editions/elsewhere')

    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
