import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, signedOutTheme } from '../../../shared/lib/theme'
import { AccountTheme } from './account-theme'

const state = vi.hoisted(() => ({ theme: null as 'light' | 'dark' | null }))

vi.mock('../../../shared/lib/theme', () => ({ applyTheme: vi.fn(), signedOutTheme: vi.fn() }))
vi.mock('../api/theme', () => ({
  accountOptions: () => ({
    queryKey: ['account'],
    queryFn: () => Promise.resolve({ id: 'a', email: 'a@x.test', theme: state.theme }),
  }),
}))

beforeEach(() => {
  state.theme = null
  vi.mocked(applyTheme).mockClear()
  vi.mocked(signedOutTheme).mockReturnValue(null)
})

afterEach(cleanup)

const renderTheme = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AccountTheme />
    </QueryClientProvider>,
  )

describe('AccountTheme', () => {
  it('changes nothing until the account is known, then shows its theme', async () => {
    state.theme = 'dark'
    renderTheme()

    expect(applyTheme).not.toHaveBeenCalled()
    await waitFor(() => expect(applyTheme).toHaveBeenCalledWith('dark'))
    expect(vi.mocked(applyTheme).mock.calls.every(([theme]) => theme === 'dark')).toBe(true)
  })

  it('shows the system theme for an account with none', async () => {
    renderTheme()

    await waitFor(() => expect(applyTheme).toHaveBeenCalledWith(null))
  })

  it('gives the theme chosen in this browser back once the account is gone', async () => {
    state.theme = 'light'
    vi.mocked(signedOutTheme).mockReturnValue('dark')
    const { unmount } = renderTheme()
    await waitFor(() => expect(applyTheme).toHaveBeenLastCalledWith('light'))

    unmount()

    expect(applyTheme).toHaveBeenLastCalledWith('dark')
  })
})
