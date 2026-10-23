import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import { errorMessage, unknownError } from './errors'

describe('errorMessage', () => {
  it('maps a known code', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(i18n._(errorMessage('tenant.slug-taken'))).toBe(
      'Ten adres jest już zajęty przez inny konwent.',
    )
  })

  it('falls back to the generic message for an unknown code', () => {
    expect(errorMessage('no.such-code')).toBe(unknownError)
  })
})
