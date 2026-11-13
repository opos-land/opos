import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewConventionPage } from './new-convention-page'

const create = vi.fn<(input: unknown) => Promise<unknown>>()

vi.mock('../api/conventions', () => ({
  adminKey: () => ['admin'],
  createConventionOptions: () => ({ mutationFn: (input: unknown) => create(input) }),
}))

function Where() {
  const location = useLocation()
  return <p>at {location.pathname}</p>
}

function renderPage() {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/conventions/new']}>
          <Routes>
            <Route path="/conventions/new" element={<NewConventionPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  return userEvent.setup()
}

const fill = async (user: ReturnType<typeof userEvent.setup>, values: Record<string, string>) => {
  for (const [label, value] of Object.entries(values)) {
    await user.type(screen.getByLabelText(label), value)
  }
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  create.mockReset()
})

afterEach(cleanup)

describe('NewConventionPage', () => {
  it('creates a convention with its first head organizer and opens its page', async () => {
    create.mockResolvedValue({ id: 'c-1', name: 'Convention A' })
    const user = renderPage()

    await fill(user, {
      Name: 'Convention A',
      Address: 'convention-a',
      'Email address of the first head organizer': 'head@example.test',
    })
    await user.selectOptions(screen.getByLabelText('Convention language'), 'en')
    await user.selectOptions(screen.getByLabelText('Time zone'), 'Europe/Prague')
    await user.click(screen.getByRole('button', { name: 'Create the convention' }))

    expect(await screen.findByText('at /conventions/c-1')).toBeTruthy()
    expect(create).toHaveBeenCalledWith({
      body: {
        name: 'Convention A',
        slug: 'convention-a',
        defaultLocale: 'en',
        timezone: 'Europe/Prague',
        headEmail: 'head@example.test',
      },
    })
  })

  it('starts in Polish and the time zone of Warsaw, as most conventions are', () => {
    renderPage()

    expect(screen.getByLabelText<HTMLSelectElement>('Convention language').value).toBe('pl')
    expect(screen.getByLabelText<HTMLSelectElement>('Time zone').value).toBe('Europe/Warsaw')
  })

  it('says what is wrong beside each field and sends nothing', async () => {
    const user = renderPage()

    await fill(user, { Address: 'Bad_Slug', 'Email address of the first head organizer': 'head' })
    await user.click(screen.getByRole('button', { name: 'Create the convention' }))

    expect(await screen.findByText('Enter a name of up to 200 characters.')).toBeTruthy()
    expect(screen.getByText('Use 3 to 40 lowercase letters, digits and hyphens.')).toBeTruthy()
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('stays on the form when the API refuses, for the admin to change what was refused', async () => {
    create.mockRejectedValue(new Error('refused'))
    const user = renderPage()

    await fill(user, {
      Name: 'Convention A',
      Address: 'convention-a',
      'Email address of the first head organizer': 'head@example.test',
    })
    await user.click(screen.getByRole('button', { name: 'Create the convention' }))

    await vi.waitFor(() => expect(create).toHaveBeenCalled())
    expect(screen.getByLabelText<HTMLInputElement>('Address').value).toBe('convention-a')
    expect(screen.queryByText(/^at /)).toBeNull()
  })

  it('names itself in the browser tab and leads back to the conventions', () => {
    renderPage()

    expect(document.title).toBe('New convention · OPOS administration')
    expect(screen.getByRole('link', { name: 'Back to the conventions' }).getAttribute('href')).toBe(
      '/',
    )
  })
})
