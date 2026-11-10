import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { usePageTitle } from '../lib/page-title'
import { PageBreadcrumb } from './page-breadcrumb'

function Programme() {
  usePageTitle('Programme', 'Edition 2026')
  return null
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

describe('PageBreadcrumb', () => {
  it('leads from what the page belongs to down to the page itself', () => {
    render(
      <I18nProvider i18n={i18n}>
        <Programme />
        <PageBreadcrumb />
      </I18nProvider>,
    )

    const trail = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(
      within(trail)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Edition 2026', 'Programme'])
    expect(within(trail).getByText('Programme').getAttribute('aria-current')).toBe('page')
  })

  it('shows nothing while no page names itself', () => {
    render(
      <I18nProvider i18n={i18n}>
        <PageBreadcrumb />
      </I18nProvider>,
    )

    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
