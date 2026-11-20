import { errorMessages } from '@opos/i18n/errors'
import { describe, expect, it } from 'vitest'
import { errorCodes } from './errors'

describe('errorCodes', () => {
  it('lists the code of a Supabase Auth outage', () => {
    expect(errorCodes).toContain('server.unavailable')
  })

  it.each([
    'request.origin-denied',
    'auth.invalid_credentials',
    'auth.email_not_confirmed',
    'auth.weak_password',
    'auth.same_password',
    'auth.otp_expired',
    'auth.email_address_invalid',
    'auth.over_email_send_rate_limit',
    'auth.over_request_rate_limit',
    'auth.google-failed',
  ])('lists %s of the sign-in routes', (code) => {
    expect(errorCodes).toContain(code)
  })

  it('lists the code of a suspended tenant', () => {
    expect(errorCodes).toContain('tenant.suspended')
  })

  it.each([
    'tenant.not-suspended',
    'tenant.has-orders',
    'tenant.slug-taken',
    'tenant.slug-reserved',
    'tenant.slug-retired',
    'account.not-found',
    'account.unconfirmed',
    'account.is-admin',
    'admin.mfa-not-enabled',
    'admin.grant-outdated',
  ])('lists %s of the admin routes', (code) => {
    expect(errorCodes).toContain(code)
  })

  it('lists the code of a session below aal2 on an account with 2FA', () => {
    expect(errorCodes).toContain('session.mfa-required')
  })

  it.each(['mfa.code-invalid', 'mfa.already-enabled', 'mfa.not-required', 'mfa.not-enabled'])(
    'lists %s of the two-factor routes',
    (code) => {
      expect(errorCodes).toContain(code)
    },
  )

  // What an order keeps in place (docs/specs/0003-catalog.md, L2 and L3;
  // docs/specs/0004-checkout-and-orders.md, A7).
  it.each([
    'catalog.in-use',
    'catalog.below-held',
    'consent.in-use',
    'shop.payments-under-way',
    'edition.has-orders',
    'order.hold-ended',
    'order.already-paid',
  ])('lists %s of the refusals an order causes', (code) => {
    expect(errorCodes).toContain(code)
  })

  // What an org does with an order (docs/specs/0006-order-management.md, Routes).
  it.each(['order.not-correctable'])('lists %s of order management', (code) => {
    expect(errorCodes).toContain(code)
  })

  it.each(errorCodes)('%s has a message in @opos/i18n/errors', (code) => {
    expect(errorMessages[code]).toBeDefined()
  })
})
