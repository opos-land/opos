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
      '/login?redirect=%2Fconventions%2Fnew',
      '/auth/mfa?redirect=%2Fconventions%2Fnew',
    ],
  ])(
    'takes the %s page to the code screen, whose sign-out lets another person in',
    (_n, from, to) => {
      renderAt(from)

      waiting()

      expect(screen.getByText(`at ${to}`)).toBeTruthy()
    },
  )

  it('leaves the pages that need a session to RequireSession, which leads them to the code screen', () => {
    renderAt('/conventions/new?step=2')

    waiting()

    expect(screen.getByText('at /conventions/new?step=2')).toBeTruthy()
  })

  it('stays on the code screen', () => {
    renderAt('/auth/mfa?redirect=%2Fconventions%2Fnew')

    waiting()

    expect(screen.getByText('at /auth/mfa?redirect=%2Fconventions%2Fnew')).toBeTruthy()
  })
})
