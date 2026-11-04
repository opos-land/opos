import { describe, expect, it } from 'vitest'
import { glossary } from './glossary'

describe('glossary', () => {
  it('labels two-factor authentication with its term in PRODUCT.md 3, not its code name', () => {
    expect(glossary.mfa.comment).toBe('Glossary term: two-factor authentication')
  })
})
