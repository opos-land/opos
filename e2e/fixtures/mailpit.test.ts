import { describe, expect, it } from 'vitest'
import { invitationLinkIn, verifyLinkIn } from './mailpit'

const mail = (Text: string) => ({ Subject: 'Subject', Text })

describe('links in a message', () => {
  it('finds the Supabase Auth verify link in the text part', () => {
    const link = 'http://localhost:9999/verify?token=abc&type=signup&redirect_to=http://x/cb'
    expect(verifyLinkIn(mail(`Confirm your address:\n${link}\n\nThanks`))).toBe(link)
  })

  it('finds the invitation link in the text part', () => {
    const link = 'http://panel.localhost:5173/invitation?token=a.b.c'
    expect(invitationLinkIn(mail(`Join the team: ${link} (valid for 7 days)`))).toBe(link)
  })

  it('names the message without the link it was searched for', () => {
    expect(() => invitationLinkIn(mail('No link here'))).toThrow('no invitation link in "Subject"')
  })
})
