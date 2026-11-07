import { randomUUID } from 'node:crypto'
import { type AddressInfo, createServer } from 'node:net'
import { inspect } from 'node:util'
import { Logger } from '@nestjs/common'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { Webhook } from 'standardwebhooks'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { authUrl, loadEnv } from '../src/config/env'
import { createApp } from './app'
import {
  createAccount,
  deleteCreatedAccounts,
  deleteLater,
  session,
  signIn,
  TEST_PASSWORD,
} from './auth'
import { HOOK_PORT_TIMEOUT_MS, listenOnHookPort } from './hook-port'
import { confirmLinkIn, deleteMail, waitForMail } from './mailpit'
import { closeTenantDb, emailConfirmed } from './tenants'

// Supabase Auth calls the hook at host.docker.internal:<PORT>, so this file runs the API on the
// PORT it is configured with, on every interface.

const env = loadEnv()
const confirmUrl = `${env.PORTAL_URL}/auth/confirm`
const addresses: string[] = []
let app: NestExpressApplication

const newAddress = () => {
  const address = `hook-${randomUUID().slice(0, 8)}@example.test`
  addresses.push(address)
  return address
}

const auth = (path: string, init: RequestInit = {}) =>
  fetch(`${authUrl(env)}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })

/**
 * Redeems the token of an `/auth/confirm` link straight at Supabase Auth, as the API's
 * `POST /auth/verify` does for the supported types, and returns where Supabase Auth sends the
 * browser.
 */
async function redeem(link: URL) {
  const query = new URLSearchParams({
    token: link.searchParams.get('token_hash') ?? '',
    type: link.searchParams.get('type') ?? '',
    redirect_to: confirmUrl,
  })
  const response = await fetch(`${authUrl(env)}/verify?${query.toString()}`, { redirect: 'manual' })
  expect(response.status).toBe(303)
  const location = response.headers.get('location') ?? ''
  expect(location).not.toMatch(/error/)
  return location
}

const signed = (body: object, secret = env.SEND_EMAIL_HOOK_SECRET) => {
  const payload = JSON.stringify(body)
  const id = `msg_${randomUUID()}`
  const now = new Date()
  return {
    payload,
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(now.getTime() / 1000)),
      'webhook-signature': new Webhook(secret.replace(/^v1,/, '')).sign(id, now, payload),
    },
  }
}

const hookBody = (type: string, email = newAddress()) => ({
  user: { id: randomUUID(), email, user_metadata: {} },
  email_data: {
    token: '123456',
    token_hash: 'hash',
    redirect_to: confirmUrl,
    email_action_type: type,
  },
})

beforeAll(async () => {
  app = await createApp()
  await listenOnHookPort(app, env.PORT)
}, HOOK_PORT_TIMEOUT_MS)

afterAll(async () => {
  await deleteCreatedAccounts()
  await Promise.all(addresses.map(deleteMail))
  await closeTenantDb()
  await app.close()
})

describe('emails from Supabase Auth', () => {
  it('confirms a sign-up in the locale sent with it', async () => {
    const email = newAddress()
    const response = await auth(`/signup?redirect_to=${encodeURIComponent(confirmUrl)}`, {
      method: 'POST',
      body: JSON.stringify({ email, password: TEST_PASSWORD, data: { locale: 'en' } }),
    })
    expect(response.status).toBe(200)
    const { id } = (await response.json()) as { id: string }
    deleteLater(id)

    const [mail] = await waitForMail(email)
    expect(mail?.Subject).toBe('Confirm your email address')
    expect(mail?.HTML).toContain('Confirm email address')
    expect(await emailConfirmed(id)).toBe(false)

    const link = confirmLinkIn(mail!)
    expect(link.searchParams.get('type')).toBe('signup')
    expect(await redeem(link)).toContain(confirmUrl)
    await expect(signIn(email)).resolves.toBeTypeOf('string')
    expect(await emailConfirmed(id)).toBe(true)
  })

  it.each([env.PORTAL_URL, env.PANEL_URL])(
    'links a sign-up to /auth/confirm of %s without naming Supabase Auth',
    async (origin) => {
      const email = newAddress()
      const redirectTo = `${origin}/auth/confirm`
      const response = await auth(`/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        body: JSON.stringify({ email, password: TEST_PASSWORD }),
      })
      deleteLater(((await response.json()) as { id: string }).id)

      const [mail] = await waitForMail(email)
      const link = confirmLinkIn(mail!)
      expect(`${link.origin}${link.pathname}`).toBe(redirectTo)
      expect(link.searchParams.get('type')).toBe('signup')
      expect(link.searchParams.get('token_hash')).toBeTruthy()
      expect(mail?.Text).not.toContain('/verify')
    },
  )

  it('writes in the default locale when nothing else decides', async () => {
    const email = newAddress()
    const response = await auth('/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    })
    deleteLater(((await response.json()) as { id: string }).id)

    const [mail] = await waitForMail(email)
    expect(mail?.Subject).toBe('Potwierdź swój adres e-mail')
  })

  it("sends the password reset in the account's own locale", async () => {
    const account = await createAccount({ locale: 'pl' })
    addresses.push(account.email)
    const token = await signIn(account.email)
    await request(app.getHttpServer())
      .patch('/me')
      .use(session(token))
      .send({ locale: 'en' })
      .expect(200)

    const response = await auth(`/recover?redirect_to=${encodeURIComponent(confirmUrl)}`, {
      method: 'POST',
      body: JSON.stringify({ email: account.email }),
    })
    expect(response.status).toBe(200)

    const [mail] = await waitForMail(account.email)
    expect(mail?.Subject).toBe('Reset your password')
    const link = confirmLinkIn(mail!)
    expect(link.searchParams.get('type')).toBe('recovery')
    expect(await redeem(link)).toContain('access_token=')
  })

  it('confirms an email change on both addresses', async () => {
    const account = await createAccount({ locale: 'en' })
    addresses.push(account.email)
    const token = await signIn(account.email)
    const next = newAddress()

    const response = await auth('/user', {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: next }),
    })
    expect(response.status).toBe(200)

    const [current] = await waitForMail(account.email)
    const [incoming] = await waitForMail(next)
    expect(current?.Subject).toBe('Confirm the change of your email address')
    expect(current?.Text).toContain(next)
    expect(incoming?.Subject).toBe('Confirm your new email address')

    await redeem(confirmLinkIn(current!))
    await redeem(confirmLinkIn(incoming!))
    await expect(signIn(next)).resolves.toBeTypeOf('string')
  })
})

describe('POST /hooks/send-email', () => {
  it.each([
    `${env.PANEL_URL}/auth/callback`,
    `${env.PORTAL_URL}/`,
    'https://evil.example/auth/confirm',
  ])('sends the confirmation page of the portal for the redirect %s', async (redirectTo) => {
    const body = hookBody('signup')
    body.email_data.redirect_to = redirectTo
    const { payload, headers } = signed(body)

    await request(app.getHttpServer())
      .post('/hooks/send-email')
      .set(headers)
      .send(payload)
      .expect(200)

    const [mail] = await waitForMail(body.user.email)
    const link = confirmLinkIn(mail!)
    expect(`${link.origin}${link.pathname}`).toBe(confirmUrl)
    expect(mail?.Text).not.toContain('/verify')
  })

  it('refuses a request without a signature', async () => {
    const res = await request(app.getHttpServer())
      .post('/hooks/send-email')
      .send(hookBody('signup'))
      .expect(401)

    expect(res.body).toMatchObject({ code: 'session.invalid' })
  })

  it('refuses a request signed with another secret', async () => {
    const other = `v1,whsec_${Buffer.from('another-send-email-hook-secret!!').toString('base64')}`
    const { payload, headers } = signed(hookBody('signup'), other)

    await request(app.getHttpServer())
      .post('/hooks/send-email')
      .set(headers)
      .send(payload)
      .expect(401)
  })

  it.each(['magiclink', 'invite', 'reauthentication'])('refuses %s with 400', async (type) => {
    const { payload, headers } = signed(hookBody(type))

    const res = await request(app.getHttpServer())
      .post('/hooks/send-email')
      .set(headers)
      .send(payload)
      .expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
  })

  it('refuses a malformed payload with 400', async () => {
    const { payload, headers } = signed({ user: {}, email_data: {} })

    await request(app.getHttpServer())
      .post('/hooks/send-email')
      .set(headers)
      .send(payload)
      .expect(400)
  })

  it('answers 500 when SMTP fails, so Supabase Auth reports the failed send', async () => {
    const broken = await createApp({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' })
    try {
      const { payload, headers } = signed(hookBody('signup'))

      const res = await request(broken.getHttpServer())
        .post('/hooks/send-email')
        .set(headers)
        .send(payload)
        .expect(500)

      expect(res.body).toMatchObject({ code: 'server.error' })
    } finally {
      await broken.close()
    }
  })

  it('logs no address when the SMTP server refuses the recipient', async () => {
    const recipient = 'anna.secret@example.test'
    const smtp = createServer((socket) => {
      socket.on('error', () => undefined)
      socket.write('220 refusing ESMTP\r\n')
      socket.on('data', (chunk) => {
        for (const line of chunk.toString().split('\r\n')) {
          if (/^(EHLO|HELO)/i.test(line)) socket.write('250 ok\r\n')
          else if (/^MAIL/i.test(line)) socket.write('250 ok\r\n')
          else if (/^RCPT/i.test(line)) socket.write(`550 5.1.1 <${recipient}> unknown\r\n`)
          else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n')
        }
      })
    })
    await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve))
    const refusing = await createApp({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String((smtp.address() as AddressInfo).port),
    })
    const logs = [
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
    ]
    try {
      const { payload, headers } = signed(hookBody('signup', recipient))

      const res = await request(refusing.getHttpServer())
        .post('/hooks/send-email')
        .set(headers)
        .send(payload)
        .expect(500)

      expect(res.body).toMatchObject({ code: 'server.error' })
      const lines = logs.flatMap((spy) => spy.mock.calls.map((call) => inspect(call, { depth: 8 })))
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.join('\n')).not.toContain(recipient)
      expect(lines.join('\n')).toContain('EENVELOPE')
    } finally {
      vi.restoreAllMocks()
      await refusing.close()
      smtp.close()
    }
  })

  it('answers 500 before Supabase Auth gives up when SMTP is slow', async () => {
    // Every reply comes 1.5 s late: within the per-step timeouts, past the 4 s deadline in total.
    const commands: string[] = []
    const smtp = createServer((socket) => {
      socket.on('error', () => undefined)
      socket.write('220 slow ESMTP\r\n')
      socket.on('data', (chunk) => {
        commands.push(chunk.toString())
        setTimeout(() => socket.writable && socket.write('250 ok\r\n'), 1_500)
      })
    })
    await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve))
    const slow = await createApp({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String((smtp.address() as AddressInfo).port),
    })
    try {
      const { payload, headers } = signed(hookBody('signup'))
      const started = Date.now()

      await request(slow.getHttpServer())
        .post('/hooks/send-email')
        .set(headers)
        .send(payload)
        .expect(500)

      expect(Date.now() - started).toBeLessThan(5_000)
      expect(commands.join('')).not.toMatch(/^DATA/m)
    } finally {
      await slow.close()
      smtp.close()
    }
  }, 10_000)
})
