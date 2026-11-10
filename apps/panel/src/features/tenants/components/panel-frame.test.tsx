import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '../../../shared/ui'
import { PanelFrame } from './panel-frame'

// The account menu has tests of its own.
vi.mock('../../account', () => ({ NavUser: () => <p>the account</p> }))

const view = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/first']}>
        <SidebarProvider>
          <Routes>
            <Route
              path="*"
              element={
                <PanelFrame
                  switcher={<p>the switcher</p>}
                  menu={<Link to="/second">the second page</Link>}
                >
                  <p>the page</p>
                </PanelFrame>
              }
            />
          </Routes>
        </SidebarProvider>
      </MemoryRouter>
    </I18nProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(() => {
  cleanup()
  window.innerWidth = 1024
})

describe('PanelFrame', () => {
  it('frames the page with the switcher, the menu and the account in the sidebar', () => {
    view()

    expect(screen.getByText('the switcher')).toBeDefined()
    expect(screen.getByRole('link', { name: 'the second page' })).toBeDefined()
    expect(screen.getByText('the account')).toBeDefined()
    expect(screen.getByText('the page')).toBeDefined()
    // The bar's button and the rail on the sidebar's edge.
    expect(screen.getAllByRole('button', { name: 'Toggle Sidebar' })).toHaveLength(2)
  })

  it('closes the sidebar of a narrow screen once a link in it opens another page', async () => {
    window.innerWidth = 500
    view()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))
    const sheet = await screen.findByRole('dialog')
    await user.click(within(sheet).getByRole('link', { name: 'the second page' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
