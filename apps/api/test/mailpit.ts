// Mailpit catches every dev email; its HTTP API lets a test read what the API sent (PLAN.md 12).

const api = `http://localhost:${process.env.OPOS_MAILPIT_PORT ?? '8025'}/api/v1`

export interface Mail {
  ID: string
  Subject: string
  Text: string
  HTML: string
  To: { Address: string }[]
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, init)
  if (!response.ok) throw new Error(`mailpit ${path}: ${response.status}`)
  return (await response.json()) as T
}

/** Every message to `address`, waiting until there are at least `count` of them. */
export async function waitForMail(address: string, count = 1, timeoutMs = 10_000) {
  const query = encodeURIComponent(`to:"${address}"`)
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const { messages } = await json<{ messages: { ID: string }[] }>(`/search?query=${query}`)
    if (messages.length >= count) {
      return Promise.all(messages.map(({ ID }) => json<Mail>(`/message/${ID}`)))
    }
    if (Date.now() > deadline) throw new Error(`no email to ${address} within ${timeoutMs} ms`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/** The first link to Supabase Auth's `/verify` in the text part of a message. */
export function verifyLinkIn(mail: Mail) {
  const link = /https?:\/\/\S+\/verify\?\S+/.exec(mail.Text)?.[0]
  if (!link) throw new Error(`no verify link in "${mail.Subject}"`)
  return link
}

/** Removes the messages to `address`, so Mailpit keeps no test mail behind. */
export async function deleteMail(address: string) {
  const query = encodeURIComponent(`to:"${address}"`)
  await fetch(`${api}/search?query=${query}`, { method: 'DELETE' })
}

/** The organizer invitation link in the text part of a message (PLAN.md 7.7). */
export function invitationLinkIn(mail: Mail) {
  const link = /https?:\/\/\S+\/invitation\?token=\S+/.exec(mail.Text)?.[0]
  if (!link) throw new Error(`no invitation link in "${mail.Subject}"`)
  return new URL(link)
}
