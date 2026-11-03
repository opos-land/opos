import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPasswordLink, setPassword } from '../api/auth'
import { ChoosePasswordForm } from './choose-password-form'

vi.mock('../api/auth', () => ({ setPassword: vi.fn(), sendPasswordLink: vi.fn() }))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  vi.mocked(setPassword).mockReset().mockResolvedValue(null)
  vi.mocked(sendPasswordLink).mockReset().mockResolvedValue(null)
})

afterEach(cleanup)

const renderForm = (onDone = vi.fn(), returnTo = '/account') => {
  render(
    <I18nProvider i18n={i18n}>
      <ChoosePasswordForm email="a@x.test" returnTo={returnTo} onDone={onDone} />
    </I18nProvider>,
  )
  return onDone
}

async function submit(user: ReturnType<typeof userEvent.setup>, password: string) {
  const fields = [
    screen.getByLabelText(/New password/),
    screen.getByLabelText('Repeat the password'),
  ]
  for (const field of fields) {
    await user.clear(field)
    await user.type(field, password)
  }
  await user.click(screen.getByRole('button', { name: 'Save the password' }))
}

describe('ChoosePasswordForm', () => {
  it('saves the password, then goes on', async () => {
    const user = userEvent.setup()
    const onDone = renderForm()

    await submit(user, 'correct horse')

    expect(setPassword).toHaveBeenCalledWith('correct horse')
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('shows the refusal by its code and stays', async () => {
    const user = userEvent.setup()
    vi.mocked(setPassword).mockResolvedValueOnce(
      new ORPCError('auth.weak_password', { status: 422 }),
    )
    const onDone = renderForm()

    await submit(user, 'correct horse')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Send a new link' })).toBeNull()
  })

  it('offers a new link by email once the sign-in is too old to change the password', async () => {
    const user = userEvent.setup()
    vi.mocked(setPassword).mockResolvedValueOnce(
      new ORPCError('session.reauthentication-required', { status: 401 }),
    )
    const onDone = renderForm()

    await submit(user, 'correct horse')
    await user.click(await screen.findByRole('button', { name: 'Send a new link' }))

    expect(sendPasswordLink).toHaveBeenCalledWith('a@x.test', '/account')
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })
})
