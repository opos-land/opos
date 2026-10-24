import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ErrorMessage } from './messages'

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

const renderError = (error: unknown) =>
  render(
    <I18nProvider i18n={i18n}>
      <ErrorMessage error={error} />
    </I18nProvider>,
  )

describe('ErrorMessage', () => {
  it("shows the catalog's message for the code, not the API's message", () => {
    renderError(new ORPCError('edition.active', { status: 409, message: 'Edition is active' }))

    expect(screen.getByRole('alert').textContent).toBe(
      'You cannot delete the active edition. Activate another edition first.',
    )
    expect(screen.queryByText('Edition is active')).toBeNull()
  })

  it('shows the generic message for a code the catalog does not know', () => {
    renderError(new ORPCError('brand.new', { status: 409, message: 'Some English sentence' }))

    expect(screen.getByRole('alert').textContent).toBe('Something went wrong. Try again.')
  })

  it('shows nothing without an error', () => {
    renderError(null)

    expect(screen.queryByRole('alert')).toBeNull()
  })
})
