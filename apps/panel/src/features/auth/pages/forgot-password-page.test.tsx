import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPasswordLink } from '../api/auth'
import { ForgotPasswordPage } from './forgot-password-page'

vi.mock('../api/auth', () => ({ sendPasswordLink: vi.fn() }))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  vi.mocked(sendPasswordLink).mockReset()
})

afterEach(cleanup)

async function request() {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    </I18nProvider>,
  )
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'ada@example.test')
  await user.click(screen.getByRole('button', { name: 'Send the link' }))
}

describe('ForgotPasswordPage', () => {
  it('asks the API for the link and confirms the message', async () => {
    vi.mocked(sendPasswordLink).mockResolvedValue(null)

    await request()

    expect(sendPasswordLink).toHaveBeenCalledWith('ada@example.test', '/')
    expect((await screen.findByRole('status')).textContent).toContain(
      'If an account uses ada@example.test',
    )
  })

  it('shows a refusal by its code and sends nothing more', async () => {
    vi.mocked(sendPasswordLink).mockResolvedValue(
      new ORPCError('auth.over_email_send_rate_limit', { status: 429 }),
    )

    await request()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
