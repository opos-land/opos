import { describe, expect, it } from 'vitest'
import { confirmLinkIn, invitationLinkIn } from './mailpit'

const mail = (Text: string) => ({ Subject: 'Subject', Text })

describe('links in a message', () => {
  it('finds the /auth/confirm link of an application in the text part', () => {
    const link = 'http://panel.opos.localhost:5173/auth/confirm?token_hash=abc&type=signup'
    expect(confirmLinkIn(mail(`Confirm your address:\n${link}\n\nThanks`))).toBe(link)
  })

  it('finds the invitation link in the text part', () => {
    const link = 'http://panel.opos.localhost:5173/invitation?token=a.b.c'
    expect(invitationLinkIn(mail(`Join the team: ${link} (valid for 7 days)`))).toBe(link)
  })

  it('names the message without the link it was searched for', () => {
    expect(() => invitationLinkIn(mail('No link here'))).toThrow('no invitation link in "Subject"')
  })
})
