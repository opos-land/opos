import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { SidebarMenu, SidebarProvider, useSidebar } from '../../../shared/ui'
import { SidebarFolder } from './sidebar-folder'

/** Whether the sidebar is expanded or collapsed to icons. */
const SidebarState = () => <output aria-label="the sidebar">{useSidebar().state}</output>

const view = (path: string, { collapsed = false } = {}) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider defaultOpen={!collapsed}>
        <SidebarMenu>
          <SidebarFolder
            icon={<svg />}
            title="Offer"
            links={[
              { to: '/edition/ticket-types', label: 'Ticket types' },
              { to: '/edition/add-ons', label: 'Add-ons' },
            ]}
          />
        </SidebarMenu>
        <Link to="/edition/add-ons/new">a page of the folder</Link>
        <Link to="/edition/orders">a page outside the folder</Link>
        <SidebarState />
      </SidebarProvider>
    </MemoryRouter>,
  )

const folder = () => screen.getByRole('button', { name: 'Offer' })
const links = () =>
  screen
    .queryAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')])
    .filter(([name]) => !name?.startsWith('a page'))

afterEach(() => {
  cleanup()
  window.innerWidth = 1024
})

describe('SidebarFolder', () => {
  it('keeps its links folded away until the member opens it, and folds them again', async () => {
    view('/edition')
    const user = userEvent.setup()

    expect(folder().getAttribute('aria-expanded')).toBe('false')
    expect(links()).toEqual([])

    await user.click(folder())

    expect(folder().getAttribute('aria-expanded')).toBe('true')
    expect(links()).toEqual([
      ['Ticket types', '/edition/ticket-types'],
      ['Add-ons', '/edition/add-ons'],
    ])

    await user.click(folder())

    expect(folder().getAttribute('aria-expanded')).toBe('false')
    expect(links()).toEqual([])
  })

  it('is open on a page of one of its links, and marks that link alone', () => {
    view('/edition/add-ons/new')

    expect(folder().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('link', { name: 'Add-ons' }).getAttribute('aria-current')).toBe('page')
    expect(
      screen.getByRole('link', { name: 'Ticket types' }).getAttribute('aria-current'),
    ).toBeNull()
    // The open folder shows where the page is by its link, not by itself.
    expect(folder().hasAttribute('data-active')).toBe(false)
  })

  it('takes no page whose address only starts like one of its links', () => {
    view('/edition/add-ons-archive')

    expect(folder().getAttribute('aria-expanded')).toBe('false')
  })

  it('opens when the member comes to one of its pages another way', async () => {
    view('/edition')
    const user = userEvent.setup()

    await user.click(screen.getByRole('link', { name: 'a page of the folder' }))

    expect(folder().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('link', { name: 'Add-ons' }).getAttribute('aria-current')).toBe('page')
  })

  it('stays open once the member leaves its pages, until the member folds it', async () => {
    view('/edition/add-ons')
    const user = userEvent.setup()

    await user.click(screen.getByRole('link', { name: 'a page outside the folder' }))

    expect(folder().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('link', { name: 'Add-ons' }).getAttribute('aria-current')).toBeNull()
  })

  it('marks itself while it is folded over the open page', async () => {
    view('/edition/add-ons')
    const user = userEvent.setup()

    await user.click(folder())

    expect(folder().getAttribute('aria-expanded')).toBe('false')
    expect(folder().hasAttribute('data-active')).toBe(true)
  })

  it('shows no link in a sidebar collapsed to icons, and marks itself on one of its pages', () => {
    view('/edition/add-ons', { collapsed: true })

    expect(screen.getByLabelText('the sidebar').textContent).toBe('collapsed')
    expect(folder().getAttribute('aria-expanded')).toBe('false')
    expect(links()).toEqual([])
    expect(folder().hasAttribute('data-active')).toBe(true)
  })

  it('expands a sidebar collapsed to icons when it is pressed there, and shows its links', async () => {
    view('/edition', { collapsed: true })
    const user = userEvent.setup()

    await user.click(folder())

    expect(screen.getByLabelText('the sidebar').textContent).toBe('expanded')
    expect(folder().getAttribute('aria-expanded')).toBe('true')
    expect(links()).toHaveLength(2)
  })

  it('keeps the folder of the open page open when it is pressed in a collapsed sidebar', async () => {
    view('/edition/add-ons', { collapsed: true })
    const user = userEvent.setup()

    await user.click(folder())

    expect(screen.getByLabelText('the sidebar').textContent).toBe('expanded')
    expect(folder().getAttribute('aria-expanded')).toBe('true')
  })

  it('shows its links on a narrow screen, where the sidebar is a sheet and never icons', async () => {
    window.innerWidth = 500
    view('/edition', { collapsed: true })
    const user = userEvent.setup()

    await user.click(folder())

    expect(folder().getAttribute('aria-expanded')).toBe('true')
    // The sidebar beside the page stays as it was: the press was not one to expand it.
    expect(screen.getByLabelText('the sidebar').textContent).toBe('collapsed')
  })
})
