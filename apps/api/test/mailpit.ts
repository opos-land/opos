// Mailpit catches every dev email; its HTTP API lets a test read what the API sent.

const api = `http://localhost:${process.env.SUPABASE_LOCAL_SMTP_PORT ?? '54324'}/api/v1`

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

/** The first link to an application's `/auth/confirm` in the text part of a message. */
export function confirmLinkIn(mail: Mail) {
  const link = /https?:\/\/\S+\/auth\/confirm\?\S+/.exec(mail.Text)?.[0]
  if (!link) throw new Error(`no confirm link in "${mail.Subject}"`)
  return new URL(link)
}

/** Removes the messages to `address`, so Mailpit keeps no test mail behind. */
export async function deleteMail(address: string) {
  const query = encodeURIComponent(`to:"${address}"`)
  await fetch(`${api}/search?query=${query}`, { method: 'DELETE' })
}

/** The organizer invitation link in the text part of a message. */
export function invitationLinkIn(mail: Mail) {
  const link = /https?:\/\/\S+\/invitation\?token=\S+/.exec(mail.Text)?.[0]
  if (!link) throw new Error(`no invitation link in "${mail.Subject}"`)
  return new URL(link)
}
