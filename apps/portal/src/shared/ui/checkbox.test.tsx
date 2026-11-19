import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Checkbox } from './checkbox'

afterEach(cleanup)

describe('Checkbox', () => {
  // The screens rely on it: a box is found by its role and its name, and says whether it is
  // ticked.
  it('is a checkbox with the name it is given, ticked or not as it is told', () => {
    render(
      <>
        <Checkbox aria-label="Child" checked={false} />
        <Checkbox aria-label="Adult" checked />
      </>,
    )

    expect(screen.getByRole('checkbox', { name: 'Child' }).getAttribute('aria-checked')).toBe(
      'false',
    )
    expect(screen.getByRole('checkbox', { name: 'Adult' }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('tells what a click asks for, and changes nothing by itself while it is controlled', () => {
    const changed = vi.fn()
    render(<Checkbox aria-label="Teen" checked={false} onCheckedChange={changed} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Teen' }))

    expect(changed).toHaveBeenCalledTimes(1)
    expect(changed.mock.calls[0]![0]).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Teen' }).getAttribute('aria-checked')).toBe(
      'false',
    )
  })

  it('takes no click while it is disabled', () => {
    const changed = vi.fn()
    render(<Checkbox aria-label="Teen" disabled onCheckedChange={changed} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Teen' }))

    expect(changed).not.toHaveBeenCalled()
  })
})
