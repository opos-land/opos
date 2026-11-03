import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useSession } from '../../../shared/lib/session'
import { MfaGate } from './mfa-gate'

function Where() {
  const location = useLocation()
  return <p>at {location.pathname + location.search}</p>
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MfaGate />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  useSession.setState({ status: 'ready', account: null })
})

afterEach(cleanup)

const waiting = () => act(() => useSession.setState({ status: 'mfa-required', account: null }))

describe('MfaGate', () => {
  it('leaves every page alone while no code is wanted', () => {
    renderAt('/login')

    expect(screen.getByText('at /login')).toBeTruthy()
  })

  it.each([
    ['sign-in', '/login', '/auth/mfa'],
    [
      'sign-in with a target',
      '/login?redirect=%2Fconvention-a%2Fsettings',
      '/auth/mfa?redirect=%2Fconvention-a%2Fsettings',
    ],
    ['a link page opened with no link', '/auth/confirm', '/auth/mfa?redirect=%2Fauth%2Fconfirm'],
  ])(
    'takes the %s page to the code screen, whose sign-out lets another person in',
    (_n, from, to) => {
      renderAt(from)

      waiting()

      expect(screen.getByText(`at ${to}`)).toBeTruthy()
    },
  )

  it.each([
    '/invitation?token=t-1',
    '/invitation',
    '/scanner',
    '/auth/confirm?token_hash=hash-a&type=recovery',
  ])('does not hold %s: it renders as for a visitor with no account', (path) => {
    renderAt(path)

    waiting()

    expect(screen.getByText(`at ${path}`)).toBeTruthy()
  })

  it('leaves the pages that need a session to RequireSession, which leads them to the code screen', () => {
    renderAt('/convention-a/team?page=2')

    waiting()

    expect(screen.getByText('at /convention-a/team?page=2')).toBeTruthy()
  })

  it('stays on the code screen', () => {
    renderAt('/auth/mfa?redirect=%2Fconvention-a%2Fsettings')

    waiting()

    expect(screen.getByText('at /auth/mfa?redirect=%2Fconvention-a%2Fsettings')).toBeTruthy()
  })
})
