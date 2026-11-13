import { describe, expect, it } from 'vitest'
import { mfaPath, mfaReturnFor } from './mfa-return'

describe('mfaPath', () => {
  it('carries the path to return to', () => {
    expect(mfaPath('/conventions/new')).toBe('/auth/mfa?redirect=%2Fconventions%2Fnew')
  })

  it('leaves out the start page', () => {
    expect(mfaPath('/')).toBe('/auth/mfa')
  })
})

describe('mfaReturnFor', () => {
  it.each([
    ['the target of a sign-in', '/login', '?redirect=%2Flog', '/log'],
    ['the start page for a sign-in that names none', '/login', '', '/'],
    ['the start page for a target on another origin', '/login', '?redirect=//evil.test', '/'],
    ['the page itself', '/conventions/new', '', '/conventions/new'],
    ['the page with its query', '/log', '?before=x', '/log?before=x'],
  ])('%s', (_name, pathname, search, expected) => {
    expect(mfaReturnFor({ pathname, search })).toBe(expected)
  })
})
