import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { accountOptions } from '../api/account'
import { AccountPage } from './account-page'

// The page through the real API link and query cache, with only `fetch` stubbed: where the answer
// of `PATCH /me` lands is the point here, so no call of the feature is replaced.

const account = {
  id: 'a',
  email: 'anna@example.test',
  firstName: null,
  lastName: null,
  locale: null,
  mfaEnabled: false,
}
const me = { ...account, signInMethods: ['password'] }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Answers by method and path, in order. */
function stubApi(routes: Record<string, Response[]>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((request: Request) => {
      const key = `${request.method} ${new URL(request.url).pathname}`
      calls.push(key)
      const answer = routes[key]?.shift()
      if (!answer) return Promise.reject(new TypeError(`no answer for ${key}`))
      return Promise.resolve(answer)
    }),
  )
  return calls
}

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

async function openPage(queryClient = client()) {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/account']}>
          <AccountPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
  await screen.findByText('Signed in as anna@example.test')
  return userEvent.setup()
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AccountPage through the query cache', () => {
  it('shows the language it saved, and asks GET /me no more', async () => {
    const calls = stubApi({
      'GET /me': [json(200, me)],
      'PATCH /me': [json(200, { ...account, locale: 'en' })],
    })
    const user = await openPage()
    const select = screen.getByLabelText<HTMLSelectElement>('Interface language')

    await user.selectOptions(select, 'en')

    await waitFor(() => expect(select.value).toBe('en'))
    expect(calls).toEqual(['GET /me', 'PATCH /me'])
  })

  it('puts the name it saved into the cached account, beside the sign-in methods', async () => {
    stubApi({
      'GET /me': [json(200, me)],
      'PATCH /me': [json(200, { ...account, firstName: 'Anna' })],
    })
    const queryClient = client()
    const user = await openPage(queryClient)

    await user.type(screen.getByLabelText('First name'), 'Anna')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Your name is saved.')).toBeTruthy()
    expect(queryClient.getQueryData(accountOptions().queryKey)).toEqual({
      ...me,
      firstName: 'Anna',
    })
  })

  it('keeps the two-factor card, though the answer names no sign-in methods', async () => {
    stubApi({
      'GET /me': [json(200, me)],
      'PATCH /me': [json(200, { ...account, locale: 'en' })],
    })
    const user = await openPage()
    const select = screen.getByLabelText<HTMLSelectElement>('Interface language')

    await user.selectOptions(select, 'en')

    await waitFor(() => expect(select.value).toBe('en'))
    expect(screen.getByRole('button', { name: 'Turn on two-factor authentication' })).toBeTruthy()
  })
})
