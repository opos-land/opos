import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CheckboxField } from './checkbox-field'

afterEach(cleanup)

describe('CheckboxField', () => {
  it('names its box by its visible label', () => {
    render(<CheckboxField label="Adult" checked onChange={() => {}} />)

    const box = screen.getByRole('checkbox', { name: 'Adult' })
    expect(box.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Adult')).toBeDefined()
  })

  it('tells whether it is ticked once it is clicked, by the box or by its label', () => {
    const changed = vi.fn()
    render(<CheckboxField label="Teen" checked={false} onChange={changed} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Teen' }))
    fireEvent.click(screen.getByText('Teen'))

    expect(changed.mock.calls.map(([checked]) => checked as boolean)).toEqual([true, true])
  })

  it('tells its hint to assistive technology with the box', () => {
    render(
      <CheckboxField
        label="Excluded"
        hint="No code applies."
        checked={false}
        onChange={() => {}}
      />,
    )

    const box = screen.getByRole('checkbox', { name: 'Excluded' })
    const described = document.getElementById(box.getAttribute('aria-describedby') ?? '')
    expect(described?.textContent).toBe('No code applies.')
  })

  it('takes no click while it is disabled', () => {
    const changed = vi.fn()
    render(<CheckboxField label="Teen" checked={false} disabled onChange={changed} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Teen' }))

    expect(changed).not.toHaveBeenCalled()
  })
})
