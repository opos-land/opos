import { randomUUID } from 'node:crypto'
import {
  emailChangeCurrentEmail,
  emailChangeNewEmail,
  recoveryEmail,
  signupEmail,
} from '@opos/i18n/emails'
import { describe, expect, it } from 'vitest'
import {
  confirmLink,
  hookEmails,
  type HookUrls,
  type SendEmailHookPayload,
} from './send-email-hook'

const authUrl = 'https://auth.opos.land'
const urls: HookUrls = {
  portalUrl: 'https://opos.land',
  panelUrl: 'https://panel.opos.land',
}

const payload = (
  type: string,
  overrides: Partial<SendEmailHookPayload['email_data']> = {},
  newEmail?: string,
): SendEmailHookPayload => ({
  user: { id: randomUUID(), email: 'anna@example.test', new_email: newEmail },
  email_data: {
    token_hash: 'hash-a',
    redirect_to: 'https://opos.land/auth/callback',
    email_action_type: type,
    ...overrides,
  },
})

describe('confirmLink', () => {
  it.each(['https://opos.land/auth/confirm', 'https://panel.opos.land/auth/confirm'])(
    'leads %s to itself with the token hash and the type, naming no Supabase address',
    (redirectTo) => {
      const link = new URL(confirmLink(urls, 'hash-a', 'signup', redirectTo))

      expect(`${link.origin}${link.pathname}`).toBe(redirectTo)
      expect(Object.fromEntries(link.searchParams)).toEqual({
        token_hash: 'hash-a',
        type: 'signup',
      })
      expect(link.href).not.toContain(authUrl)
    },
  )

  it('sends any other address to the confirmation page of the portal', () => {
    for (const redirectTo of ['https://evil.example/auth/confirm', '', undefined]) {
      expect(confirmLink(urls, 'h', 'recovery', redirectTo)).toBe(
        'https://opos.land/auth/confirm?token_hash=h&type=recovery',
      )
    }
  })

  it.each([
    'https://panel.opos.land/auth/callback',
    'https://opos.land/auth/confirm/extra',
    'https://opos.land/',
    'https://opos.land/reset-password',
  ])('builds no link through Supabase Auth from the redirect list, as for %s', (redirectTo) => {
    const link = confirmLink(urls, 'h', 'signup', redirectTo)

    expect(link).toBe('https://opos.land/auth/confirm?token_hash=h&type=signup')
    expect(link).not.toContain(authUrl)
  })
})

describe('hookEmails', () => {
  it('sends the address confirmation on signup', () => {
    expect(hookEmails(payload('signup'), urls)).toEqual([
      {
        to: 'anna@example.test',
        content: signupEmail,
        link: 'https://opos.land/auth/confirm?token_hash=hash-a&type=signup',
      },
    ])
  })

  it('links a signup to /auth/confirm of the application that asked', () => {
    const [email] =
      hookEmails(
        payload('signup', { redirect_to: 'https://panel.opos.land/auth/confirm' }),
        urls,
      ) ?? []

    expect(email?.link).toBe('https://panel.opos.land/auth/confirm?token_hash=hash-a&type=signup')
  })

  it('sends the reset link on recovery', () => {
    const [email] = hookEmails(payload('recovery'), urls) ?? []

    expect(email).toMatchObject({ to: 'anna@example.test', content: recoveryEmail })
    expect(email?.link).toContain('type=recovery')
  })

  it('confirms the new address of an email change', () => {
    const emails = hookEmails(payload('email_change', {}, 'new@example.test'), urls)

    expect(emails).toEqual([
      {
        to: 'new@example.test',
        content: emailChangeNewEmail('new@example.test'),
        link: 'https://opos.land/auth/confirm?token_hash=hash-a&type=email_change',
      },
    ])
  })

  it('asks both addresses with their own tokens under secure email change', () => {
    const emails = hookEmails(
      payload('email_change', { token_hash_new: 'hash-b' }, 'new@example.test'),
      urls,
    )

    expect(
      emails?.map(({ to, link }) => [to, new URL(link).searchParams.get('token_hash')]),
    ).toEqual([
      ['anna@example.test', 'hash-b'],
      ['new@example.test', 'hash-a'],
    ])
    expect(emails?.[0]?.content).toEqual(
      emailChangeCurrentEmail('anna@example.test', 'new@example.test'),
    )
  })

  it('refuses an email change without the new address', () => {
    expect(hookEmails(payload('email_change'), urls)).toBeUndefined()
  })

  it.each(['magiclink', 'invite', 'reauthentication', 'email', 'password_changed_notification'])(
    'refuses %s, a flow OPOS does not send',
    (type) => {
      expect(hookEmails(payload(type), urls)).toBeUndefined()
    },
  )
})
