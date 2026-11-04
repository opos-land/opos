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

const renderForm = (onDone = vi.fn(), returnTo = '/invitation') => {
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
  await user.click(screen.getByRole('button', { name: 'Save the password and join the team' }))
}

describe('ChoosePasswordForm', () => {
  it('says "join the team" only where a team is joined', () => {
    renderForm(vi.fn(), '/')

    expect(screen.getByRole('button', { name: 'Save the password' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /join the team/ })).toBeNull()
  })

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

    expect(sendPasswordLink).toHaveBeenCalledWith('a@x.test', '/invitation')
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('counts same_password as saved when it answers a retry of the password that failed before', async () => {
    const user = userEvent.setup()
    vi.mocked(setPassword)
      .mockResolvedValueOnce(new ORPCError('server.unavailable', { status: 503 }))
      .mockResolvedValueOnce(new ORPCError('auth.same_password', { status: 422 }))
    const onDone = renderForm()

    await submit(user, 'correct horse')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    await submit(user, 'correct horse')

    expect(setPassword).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('still shows same_password when the first attempt is refused with it', async () => {
    const user = userEvent.setup()
    vi.mocked(setPassword).mockResolvedValue(new ORPCError('auth.same_password', { status: 422 }))
    const onDone = renderForm()

    await submit(user, 'correct horse')
    expect(await screen.findByRole('alert')).toBeTruthy()
    await submit(user, 'correct horse')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('does not count same_password as saved for a different password', async () => {
    const user = userEvent.setup()
    vi.mocked(setPassword)
      .mockResolvedValueOnce(new ORPCError('server.unavailable', { status: 503 }))
      .mockResolvedValueOnce(new ORPCError('auth.same_password', { status: 422 }))
    const onDone = renderForm()

    await submit(user, 'correct horse')
    await screen.findByRole('alert')
    await submit(user, 'another horse')

    expect(onDone).not.toHaveBeenCalled()
  })

  it('refuses a password of more than 72 bytes with a message of its own', async () => {
    const user = userEvent.setup()
    const onDone = renderForm()

    await submit(user, 'é'.repeat(37))

    expect(await screen.findByText(/at most 72 bytes/)).toBeTruthy()
    expect(setPassword).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('accepts a password of exactly 72 bytes', async () => {
    const user = userEvent.setup()
    const onDone = renderForm()

    await submit(user, 'é'.repeat(36))

    expect(setPassword).toHaveBeenCalledWith('é'.repeat(36))
    expect(onDone).toHaveBeenCalledOnce()
  })
})
