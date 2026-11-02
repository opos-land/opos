import { errorMessages } from '@opos/i18n/errors'
import { describe, expect, it } from 'vitest'
import { errorCodes } from './errors'

describe('errorCodes', () => {
  it('lists the code of a Supabase Auth outage', () => {
    expect(errorCodes).toContain('server.unavailable')
  })

  it.each(errorCodes)('%s has a message in @opos/i18n/errors', (code) => {
    expect(errorMessages[code]).toBeDefined()
  })
})
