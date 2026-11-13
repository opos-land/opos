import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TwoFactorResetPage } from './two-factor-reset-page'

const reset = vi.fn<(input: unknown) => Promise<{ emailSent: boolean }>>()

vi.mock('../api/accounts', () => ({
  resetTwoFactorOptions: () => ({ mutationFn: (input: unknown) => reset(input) }),
}))
vi.mock('../../conventions', () => ({ adminKey: () => ['admin'] }))

/** What the write would say on success, as the application's query client reads it. */
const said: string[] = []

function renderPage() {
  const client = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: (result, _variables, _context, mutation) => {
        const success = mutation.meta?.success
        if (typeof success === 'function') {
          said.push(i18n._((success as (result: unknown) => { id: string })(result)))
        }
      },
    }),
  })
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TwoFactorResetPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return userEvent.setup()
}

const field = () => screen.getByLabelText<HTMLInputElement>('Email address of the account')
const opener = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Reset two-factor authentication' })

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  reset.mockReset()
  said.length = 0
})

afterEach(cleanup)

describe('TwoFactorResetPage', () => {
  it('asks in a modal that names the account and says it cannot be undone, then resets', async () => {
    reset.mockResolvedValue({ emailSent: true })
    const user = renderPage()

    await user.type(field(), ' Person@Example.test ')
    await user.click(opener())
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('Reset two-factor authentication of Person@Example.test?')
    expect(dialog.textContent).toContain('signs in with its password alone')
    expect(dialog.textContent).toContain('This action cannot be undone.')
    expect(reset).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    await vi.waitFor(() =>
      expect(reset).toHaveBeenCalledWith({ body: { email: 'Person@Example.test' } }),
    )
    await vi.waitFor(() => expect(field().value).toBe(''))
    expect(said).toEqual([
      'Two-factor authentication of the account is reset, and the account got an email that says so.',
    ])
  })

  it('says so when the email could not be sent, for the admin to tell the person', async () => {
    reset.mockResolvedValue({ emailSent: false })
    const user = renderPage()

    await user.type(field(), 'person@example.test')
    await user.click(opener())
    await user.click(await screen.findByRole('button', { name: 'Reset' }))

    await vi.waitFor(() =>
      expect(said).toEqual([
        'Two-factor authentication of the account is reset, but the email could not be sent. Tell the person yourself.',
      ]),
    )
  })

  it.each(['', 'person', 'person@'])(
    'offers no reset for %j, which is no address',
    async (typed) => {
      const user = renderPage()

      if (typed) await user.type(field(), typed)

      expect(opener().disabled).toBe(true)
      expect(reset).not.toHaveBeenCalled()
    },
  )

  it('keeps the address when the API refuses, and says nothing of its own', async () => {
    reset.mockRejectedValue(new Error('refused'))
    const user = renderPage()

    await user.type(field(), 'admin@example.test')
    await user.click(opener())
    await user.click(await screen.findByRole('button', { name: 'Reset' }))

    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(field().value).toBe('admin@example.test')
    expect(said).toEqual([])
  })

  it('says that an administrator is never reset here, and names itself in the tab', () => {
    renderPage()

    expect(screen.getByText(/An administrator’s account is never reset here/)).toBeTruthy()
    expect(document.title).toBe('Two-factor reset · OPOS administration')
  })
})
