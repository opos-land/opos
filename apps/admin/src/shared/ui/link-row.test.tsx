import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LinkRow } from './link-row'
import { Table, TableBody, TableCell } from './table'

const view = (to: string | undefined) =>
  render(
    <MemoryRouter initialEntries={['/list']}>
      <Routes>
        <Route
          path="/list"
          element={
            <Table>
              <TableBody>
                <LinkRow to={to}>
                  <TableCell>
                    <Link to="/elsewhere">The link</Link>
                  </TableCell>
                  <TableCell>A cell</TableCell>
                </LinkRow>
              </TableBody>
            </Table>
          }
        />
        <Route path="/item" element={<p>The item</p>} />
        <Route path="/elsewhere" element={<p>Elsewhere</p>} />
      </Routes>
    </MemoryRouter>,
  )

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LinkRow', () => {
  it('opens its page from anywhere in the row', async () => {
    view('/item')

    await userEvent.click(screen.getByText('A cell'))

    expect(await screen.findByText('The item')).toBeDefined()
  })

  it('leaves a click on a link inside it to that link', async () => {
    view('/item')

    await userEvent.click(screen.getByRole('link', { name: 'The link' }))

    expect(await screen.findByText('Elsewhere')).toBeDefined()
    expect(screen.queryByText('The item')).toBeNull()
  })

  it('opens nothing for a click that ends a text selection', async () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'selected text',
    } as Selection)
    view('/item')

    await userEvent.click(screen.getByText('A cell'))

    expect(screen.getByText('A cell')).toBeDefined()
    expect(screen.queryByText('The item')).toBeNull()
  })

  it('is inert without a page', async () => {
    view(undefined)

    await userEvent.click(screen.getByText('A cell'))

    expect(screen.getByText('A cell')).toBeDefined()
    expect(screen.getByRole('row').className).not.toContain('cursor-pointer')
  })
})
