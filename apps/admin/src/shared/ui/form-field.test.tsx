import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FormField } from './form-field'
import { Input } from './input'

afterEach(cleanup)

describe('FormField', () => {
  it('labels its control and describes it with the hint, then the error', () => {
    render(
      <FormField label="Email" hint="We never share it." error="Enter an email address.">
        {(control) => <Input {...control} />}
      </FormField>,
    )

    const input = screen.getByRole('textbox', {
      name: 'Email',
      description: 'We never share it. Enter an email address.',
    })
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('marks nothing invalid and describes nothing without a hint or an error', () => {
    render(<FormField label="Email">{(control) => <Input {...control} />}</FormField>)

    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(input.getAttribute('aria-describedby')).toBeNull()
  })

  // A form shows one alert, its own; a field's error is read through its control.
  it('announces no alert of its own', () => {
    render(
      <FormField label="Email" error="Enter an email address.">
        {(control) => <Input {...control} />}
      </FormField>,
    )

    expect(screen.queryByRole('alert')).toBeNull()
  })
})
