import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AuthLayout } from './auth-layout'

// The toggle has tests of its own.
vi.mock('../../theme', () => ({ ThemeToggle: () => <button type="button">Dark theme</button> }))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

describe('AuthLayout', () => {
  it('offers the theme toggle before sign-in, beside the title and the content', () => {
    render(
      <I18nProvider i18n={i18n}>
        <AuthLayout title="Sign in">
          <p>the form</p>
        </AuthLayout>
      </I18nProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Sign in', level: 1 })).toBeDefined()
    expect(screen.getByText('the form')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Dark theme' })).toBeDefined()
  })
})
