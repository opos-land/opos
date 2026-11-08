import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from './button'

afterEach(cleanup)

describe('Button', () => {
  // The screens rely on it: an action inside a form never submits the form.
  it('is a plain button unless told otherwise', () => {
    render(<Button>Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button')
  })
})
