import { stack } from './stack'

// Mailpit catches every dev email; its HTTP API lets a scenario read what the stack sent
// (PLAN.md 15.2).

export interface Mail {
  ID: string
  Subject: string
  Text: string
  HTML: string
  To: { Address: string }[]
}

interface Summary {
  ID: string
  Created: string
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${stack.mailpit}/api/v1${path}`, init)
  if (!response.ok) throw new Error(`mailpit ${path}: ${response.status}`)
  return (await response.json()) as T
}

const search = (address: string) => `/search?query=${encodeURIComponent(`to:"${address}"`)}`

/** Every message to `address`, newest first. */
export async function mailTo(address: string) {
  const { messages } = await json<{ messages: Summary[] }>(search(address))
  return messages
}

/**
 * The newest message to `address`, waiting until there are at least `count` of them: a scenario
 * that expects its second message passes 2.
 */
export async function waitForMail(address: string, count = 1, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const messages = await mailTo(address)
    if (messages.length >= count) {
      const newest = [...messages].sort((a, b) => b.Created.localeCompare(a.Created))[0]!
      return json<Mail>(`/message/${newest.ID}`)
    }
    if (Date.now() > deadline) throw new Error(`no email ${count} to ${address} in ${timeoutMs} ms`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

/** Removes the messages to `address`, so Mailpit keeps no scenario's mail behind. */
export async function deleteMail(address: string) {
  await fetch(`${stack.mailpit}/api/v1${search(address)}`, { method: 'DELETE' })
}

function linkIn(mail: Pick<Mail, 'Subject' | 'Text'>, pattern: RegExp, kind: string) {
  const link = pattern.exec(mail.Text)?.[0]
  if (!link) throw new Error(`no ${kind} link in "${mail.Subject}"`)
  return link
}

/** The Supabase Auth `/verify` link of a confirmation or password reset message. */
export const verifyLinkIn = (mail: Pick<Mail, 'Subject' | 'Text'>) =>
  linkIn(mail, /https?:\/\/\S+\/verify\?\S+/, 'verify')

/** The organizer invitation link, `<PANEL_URL>/invitation?token=...` (PLAN.md 7.7). */
export const invitationLinkIn = (mail: Pick<Mail, 'Subject' | 'Text'>) =>
  linkIn(mail, /https?:\/\/\S+\/invitation\?token=\S+/, 'invitation')
