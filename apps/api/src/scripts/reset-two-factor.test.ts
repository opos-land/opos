import { describe, expect, it, vi } from 'vitest'
import { reportReset } from './reset-two-factor'

const removed = { accountId: 'a', factors: 2, emailSent: true }

const output = () => ({
  log: vi.fn<(line: string) => void>(),
  error: vi.fn<(line: string) => void>(),
})

describe('reportReset', () => {
  it('says what was removed, and asks for nothing more', () => {
    const out = output()

    expect(reportReset(removed, out)).toBe(0)

    expect(out.log).toHaveBeenCalledWith('Removed 2 factor(s) of account a.')
    expect(out.error).not.toHaveBeenCalled()
  })

  it('names the reason of a failed email, and the removal stands', () => {
    const out = output()

    const code = reportReset({ ...removed, emailSent: false, emailError: 'smtp down' }, out)

    expect(code).toBe(0)
    expect(out.log).toHaveBeenCalledOnce()
    expect(out.error.mock.calls[0]?.[0]).toContain('smtp down')
  })

  it('says what was removed and fails when the codes could not go', () => {
    const out = output()

    const code = reportReset({ ...removed, codesError: 'codes store down' }, out)

    expect(code).toBe(1)
    expect(out.log).toHaveBeenCalledWith('Removed 2 factor(s) of account a.')
    expect(out.error.mock.calls[0]?.[0]).toContain('codes store down')
  })

  it('reports the email and the codes side by side', () => {
    const out = output()

    const code = reportReset(
      { ...removed, emailSent: false, emailError: 'smtp down', codesError: 'codes store down' },
      out,
    )

    expect(code).toBe(1)
    expect(out.error).toHaveBeenCalledTimes(2)
  })
})
