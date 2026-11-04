import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signUp } from '../api/auth'
import { RegisterForm } from './register-form'

vi.mock('../api/auth', () => ({ signUp: vi.fn() }))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  vi.mocked(signUp).mockReset()
})

afterEach(cleanup)

async function register(onRegistered = vi.fn()) {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <RegisterForm returnTo="/schedule" onRegistered={onRegistered} />
      </MemoryRouter>
    </I18nProvider>,
  )
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('First name'), 'Ada')
  await user.type(screen.getByLabelText('Last name'), 'Lovelace')
  await user.type(screen.getByLabelText('Email'), 'ada@example.test')
  await user.click(screen.getByRole('button', { name: 'Create an account' }))
  return onRegistered
}

describe('RegisterForm', () => {
  it('asks for the names and the address, and for no password', async () => {
    vi.mocked(signUp).mockResolvedValue(null)

    const onRegistered = await register()

    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(signUp).toHaveBeenCalledWith(
      { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' },
      '/schedule',
    )
    expect(onRegistered).toHaveBeenCalledWith('ada@example.test')
  })

  it('shows the refusal by its code and stays', async () => {
    vi.mocked(signUp).mockResolvedValue(new ORPCError('server.unavailable', { status: 503 }))

    const onRegistered = await register()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The service is temporarily unavailable. Try again in a moment.',
    )
    expect(onRegistered).not.toHaveBeenCalled()
  })
})
