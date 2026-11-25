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

  // What placing an order refuses of a cart (docs/specs/0004-checkout-and-orders.md).
  it.each(['order.unavailable', 'order.total-changed', 'order.total-too-high'])(
    'lists %s of a cart that is not placed as it stands',
    (code) => {
      expect(errorCodes).toContain(code)
    },
  )

  // What an org does with an order (docs/specs/0006-order-management.md, Routes).
  it.each([
    'order.not-correctable',
    'order.not-cancelable',
    'order.not-in-review',
    'order.not-paid',
    'scan.already-handed-out',
    'production.before-deadline',
  ])('lists %s of order management', (code) => {
    expect(errorCodes).toContain(code)
  })

  // The scanners of an edition and what a scan answers (docs/specs/0007-scanner.md, Routes).
  it.each([
    'scanner.limit-reached',
    'scanner.name-taken',
    'scanner.outlives-org',
    'scanner.code-refused',
    'scanner.revoked',
    'scanner.stopped',
    'scanner.ended',
    'scan.not-valid',
  ])('lists %s of the scanner', (code) => {
    expect(errorCodes).toContain(code)
  })

  // docs/specs/0009-buyer-self-service.md, Routes.
  it('lists order.not-extendable of "Buy more"', () => {
    expect(errorCodes).toContain('order.not-extendable')
  })

  // An order an org moved to another address is sent nowhere at its old account's asking.
  it('lists order.passed-on of "Resend QR code"', () => {
    expect(errorCodes).toContain('order.passed-on')
  })

  // A consent whose document changed since its buyer was shown it places no order.
  it('lists order.consent-changed of a consent accepted as it no longer is', () => {
    expect(errorCodes).toContain('order.consent-changed')
  })

  // docs/specs/0008-discount-codes.md, Routes.
  it.each(['discount-code.taken', 'discount-code.refused', 'discount-code.in-use'])(
    'lists %s of the discount codes',
    (code) => {
      expect(errorCodes).toContain(code)
    },
  )

  it.each(errorCodes)('%s has a message in @opos/i18n/errors', (code) => {
    expect(errorMessages[code]).toBeDefined()
  })
})
