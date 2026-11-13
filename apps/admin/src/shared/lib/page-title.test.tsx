import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render } from '@testing-library/react'
import { type ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { formatTitle, usePageTitle, usePageTrail, useScreenTitle } from './page-title'

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
  document.title = 'OPOS'
})

afterEach(cleanup)

function Page({ parts, children }: { parts: (string | undefined)[]; children?: ReactNode }) {
  usePageTitle(...parts)
  return children
}

function NotFound() {
  useScreenTitle('Page not found')
  return null
}

/** The trail of the shown title, as text. */
function Trail() {
  return usePageTrail().join(' > ')
}

const inI18n = (node: ReactNode) => <I18nProvider i18n={i18n}>{node}</I18nProvider>

describe('formatTitle', () => {
  it('joins the parts, most specific first, and ends with the application', () => {
    expect(formatTitle(['Programme', 'Convention A 2026'], 'OPOS administration')).toBe(
      'Programme · Convention A 2026 · OPOS administration',
    )
  })

  it('leaves out the parts that are missing or blank', () => {
    expect(formatTitle([undefined, ' ', 'Convention A'], 'OPOS administration')).toBe(
      'Convention A · OPOS administration',
    )
  })

  it('is the application alone without parts', () => {
    expect(formatTitle([], 'OPOS administration')).toBe('OPOS administration')
  })
})

describe('usePageTitle', () => {
  it("names the page in the tab, with the admin application's name last", () => {
    render(inI18n(<Page parts={['Programme', 'Convention A 2026']} />))

    expect(document.title).toBe('Programme · Convention A 2026 · OPOS administration')
  })

  it('follows the page when its data arrives', () => {
    const view = render(inI18n(<Page parts={['Programme', 'Convention A 2026']} />))
    view.rerender(inI18n(<Page parts={['Opening ceremony', 'Convention A 2026']} />))

    expect(document.title).toBe('Opening ceremony · Convention A 2026 · OPOS administration')
  })

  it('gives back the title the document had once the page leaves', () => {
    render(inI18n(<Page parts={['Team', 'Convention A']} />)).unmount()

    expect(document.title).toBe('OPOS')
  })
})

describe('useScreenTitle', () => {
  it('wins over the page it stands in, mounted together', () => {
    render(
      inI18n(
        <Page parts={['Programme', 'Convention A 2026']}>
          <NotFound />
        </Page>,
      ),
    )

    expect(document.title).toBe('Page not found · OPOS administration')
  })

  it('keeps winning when the page changes its title after the screen appeared', () => {
    const view = render(inI18n(<Page parts={['Programme']} />))
    view.rerender(
      inI18n(
        <Page parts={['Programme']}>
          <NotFound />
        </Page>,
      ),
    )
    view.rerender(
      inI18n(
        <Page parts={['Programme', 'Convention A 2026']}>
          <NotFound />
        </Page>,
      ),
    )

    expect(document.title).toBe('Page not found · OPOS administration')
  })

  it('hands the tab back to the page when the screen leaves', () => {
    const view = render(
      inI18n(
        <Page parts={['Programme', 'Convention A 2026']}>
          <NotFound />
        </Page>,
      ),
    )
    view.rerender(inI18n(<Page parts={['Programme', 'Convention A 2026']} />))

    expect(document.title).toBe('Programme · Convention A 2026 · OPOS administration')
  })
})

describe('usePageTrail', () => {
  it("gives the shown title's parts, the most general first", () => {
    const { container } = render(
      inI18n(
        <Page parts={['Programme', undefined, 'Convention A 2026']}>
          <Trail />
        </Page>,
      ),
    )

    expect(container.textContent).toBe('Convention A 2026 > Programme')
  })

  it('follows a screen that stands in for the page', () => {
    const { container } = render(
      inI18n(
        <Page parts={['Programme', 'Convention A 2026']}>
          <NotFound />
          <Trail />
        </Page>,
      ),
    )

    expect(container.textContent).toBe('Page not found')
  })

  it('is empty while no page names itself', () => {
    const { container } = render(inI18n(<Trail />))

    expect(container.textContent).toBe('')
  })
})
