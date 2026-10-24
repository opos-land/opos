import { randomUUID } from 'node:crypto'
import {
  emailChangeCurrentEmail,
  emailChangeNewEmail,
  recoveryEmail,
  signupEmail,
} from '@opos/i18n/emails'
import { describe, expect, it } from 'vitest'
import { hookEmails, type SendEmailHookPayload, verifyLink } from './send-email-hook'

const authUrl = 'https://auth.opos.land'

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

describe('verifyLink', () => {
  it("builds Supabase Auth's verify link with every value encoded", () => {
    const link = new URL(verifyLink(`${authUrl}/`, 'pkce_a+b', 'signup', 'https://opos.land/x?y=1'))

    expect(`${link.origin}${link.pathname}`).toBe(`${authUrl}/verify`)
    expect(Object.fromEntries(link.searchParams)).toEqual({
      token: 'pkce_a+b',
      type: 'signup',
      redirect_to: 'https://opos.land/x?y=1',
    })
  })

  it('leaves redirect_to out when Supabase Auth sent none', () => {
    expect(verifyLink(authUrl, 'h', 'recovery', '')).toBe(`${authUrl}/verify?token=h&type=recovery`)
  })
})

describe('hookEmails', () => {
  it('sends the address confirmation on signup', () => {
    expect(hookEmails(payload('signup'), authUrl)).toEqual([
      {
        to: 'anna@example.test',
        content: signupEmail,
        link: verifyLink(authUrl, 'hash-a', 'signup', 'https://opos.land/auth/callback'),
      },
    ])
  })

  it('sends the reset link on recovery', () => {
    const [email] = hookEmails(payload('recovery'), authUrl) ?? []

    expect(email).toMatchObject({ to: 'anna@example.test', content: recoveryEmail })
    expect(email?.link).toContain('type=recovery')
  })

  it('confirms the new address of an email change', () => {
    const emails = hookEmails(payload('email_change', {}, 'new@example.test'), authUrl)

    expect(emails).toEqual([
      {
        to: 'new@example.test',
        content: emailChangeNewEmail('new@example.test'),
        link: verifyLink(authUrl, 'hash-a', 'email_change', 'https://opos.land/auth/callback'),
      },
    ])
  })

  it('asks both addresses with their own tokens under secure email change', () => {
    const emails = hookEmails(
      payload('email_change', { token_hash_new: 'hash-b' }, 'new@example.test'),
      authUrl,
    )

    expect(emails?.map(({ to, link }) => [to, new URL(link).searchParams.get('token')])).toEqual([
      ['anna@example.test', 'hash-b'],
      ['new@example.test', 'hash-a'],
    ])
    expect(emails?.[0]?.content).toEqual(
      emailChangeCurrentEmail('anna@example.test', 'new@example.test'),
    )
  })

  it('refuses an email change without the new address', () => {
    expect(hookEmails(payload('email_change'), authUrl)).toBeUndefined()
  })

  it.each(['magiclink', 'invite', 'reauthentication', 'email', 'password_changed_notification'])(
    'refuses %s, a flow OPOS does not send',
    (type) => {
      expect(hookEmails(payload(type), authUrl)).toBeUndefined()
    },
  )
})
