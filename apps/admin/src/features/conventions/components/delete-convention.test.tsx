import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type AdminTenant } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteConvention } from './delete-convention'

const remove = vi.fn<(input: unknown) => Promise<unknown>>()

vi.mock('../api/conventions', () => ({
  adminKey: () => ['admin'],
  deleteConventionOptions: () => ({ mutationFn: (input: unknown) => remove(input) }),
}))

const convention: AdminTenant = {
  id: 'c-1',
  slug: 'convention-a',
  name: 'Convention A',
  defaultLocale: 'pl',
  timezone: 'Europe/Warsaw',
  suspendedAt: '2026-04-01T08:00:00.000Z',
  createdAt: '2026-03-01T10:00:00.000Z',
}

function Where() {
  const location = useLocation()
  return <p>at {location.pathname}</p>
}

function renderIt() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/conventions/c-1']}>
          <Routes>
            <Route path="/conventions/:id" element={<DeleteConvention convention={convention} />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return userEvent.setup()
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Delete the convention' }))
  return screen.findByRole('alertdialog')
}

const act = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Delete for good' })
const field = () =>
  screen.getByLabelText<HTMLInputElement>(/Type the address of the convention to confirm/)

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  remove.mockReset()
})

afterEach(cleanup)

describe('DeleteConvention', () => {
  it('asks in a modal that names the convention, says what goes and that it cannot be undone', async () => {
    const user = renderIt()

    const dialog = await open(user)

    expect(dialog.textContent).toContain('Delete the convention Convention A?')
    expect(dialog.textContent).toContain('its team, editions, programme and likes')
    expect(dialog.textContent).toContain('The accounts of its organizers and attendees stay')
    expect(dialog.textContent).toContain('This action cannot be undone.')
    expect(remove).not.toHaveBeenCalled()
  })

  it('acts only once the address of the convention is typed in', async () => {
    remove.mockResolvedValue(undefined)
    const user = renderIt()
    await open(user)

    expect(act().disabled).toBe(true)
    await user.type(field(), 'convention')
    expect(act().disabled).toBe(true)
    await user.type(field(), '-a')
    expect(act().disabled).toBe(false)
    await user.click(act())

    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith({ params: { tenantId: 'c-1' } }))
    expect(await screen.findByText('at /')).toBeTruthy()
  })

  it.each(['Convention A', 'convention-b', 'CONVENTION-A'])(
    'does not take %s for the address',
    async (typed) => {
      const user = renderIt()
      await open(user)

      await user.type(field(), `${typed}{Enter}`)

      expect(act().disabled).toBe(true)
      expect(remove).not.toHaveBeenCalled()
    },
  )

  it('forgets what was typed when the modal is left, so the next opening starts empty', async () => {
    const user = renderIt()
    await open(user)
    await user.type(field(), 'convention-a')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await open(user)

    expect(field().value).toBe('')
    expect(remove).not.toHaveBeenCalled()
  })

  it('closes when the API refuses, and stays on the page of the convention', async () => {
    remove.mockRejectedValue(new Error('refused'))
    const user = renderIt()
    await open(user)

    await user.type(field(), 'convention-a')
    await user.click(act())

    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.queryByText('at /')).toBeNull()
  })
})
