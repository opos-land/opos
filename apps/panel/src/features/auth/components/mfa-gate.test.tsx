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

describe('MfaGate', () => {
  it('leaves every page alone while no code is wanted', () => {
    renderAt('/convention-a/team')

    expect(screen.getByText('at /convention-a/team')).toBeTruthy()
  })

  it('takes any page to the code screen once an answer wants the code, keeping the path', () => {
    renderAt('/convention-a/team?page=2')

    act(() => useSession.setState({ status: 'mfa-required', account: null }))

    expect(screen.getByText('at /auth/mfa?redirect=%2Fconvention-a%2Fteam%3Fpage%3D2')).toBeTruthy()
  })

  it('returns from a sign-in to its ?redirect= target', () => {
    renderAt('/login?redirect=%2Fconvention-a%2Fsettings')

    act(() => useSession.setState({ status: 'mfa-required', account: null }))

    expect(screen.getByText('at /auth/mfa?redirect=%2Fconvention-a%2Fsettings')).toBeTruthy()
  })

  it('stays on the code screen', () => {
    renderAt('/auth/mfa?redirect=%2Fconvention-a%2Fsettings')

    act(() => useSession.setState({ status: 'mfa-required', account: null }))

    expect(screen.getByText('at /auth/mfa?redirect=%2Fconvention-a%2Fsettings')).toBeTruthy()
  })
})
