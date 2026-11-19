import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import { glossary } from './glossary'

describe('glossary', () => {
  // The terms the shop's setup brings (docs/PRODUCT.md, 3. Glossary).
  it.each([
    ['shop', 'shop', 'sklep'],
    ['consent', 'consent', 'zgoda'],
  ] as const)('renders %s as its one word in each language', async (term, en, pl) => {
    const i18n = setupI18n()

    await activateLocale(i18n, 'en')
    expect(i18n._(glossary[term])).toBe(en)
    await activateLocale(i18n, 'pl')
    expect(i18n._(glossary[term])).toBe(pl)
  })

  it('labels two-factor authentication with its term in PRODUCT.md 3, not its code name', () => {
    expect(glossary.mfa.comment).toBe('Glossary term: two-factor authentication')
  })
})
