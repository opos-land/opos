import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { Webhook } from 'standardwebhooks'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { createApp } from './app'
import { createAccount, deleteCreatedAccounts, deleteLater, signIn, TEST_PASSWORD } from './auth'
import { deleteMail, verifyLinkIn, waitForMail } from './mailpit'

// Supabase Auth calls the hook at host.docker.internal:<OPOS_API_PORT>, so this file runs the API
// on the PORT it is configured with, on every interface (PLAN.md 12, Ports).

const env = loadEnv()
const callback = `${env.PORTAL_URL}/auth/callback`
const addresses: string[] = []
let app: NestExpressApplication

const newAddress = () => {
  const address = `hook-${randomUUID().slice(0, 8)}@example.test`
  addresses.push(address)
  return address
}

const auth = (path: string, init: RequestInit = {}) =>
  fetch(`${env.AUTH_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })

/** Opens a link from an email the way a browser would, and returns where Supabase Auth sends it. */
async function follow(link: string) {
  const response = await fetch(link, { redirect: 'manual' })
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
    redirect_to: callback,
    email_action_type: type,
  },
})

beforeAll(async () => {
  app = await createApp()
  await app.listen(env.PORT)
})

afterAll(async () => {
  await deleteCreatedAccounts()
  await Promise.all(addresses.map(deleteMail))
  await app.close()
})

describe('emails from Supabase Auth', () => {
  it('confirms a sign-up in the locale sent with it', async () => {
    const email = newAddress()
    const response = await auth(`/signup?redirect_to=${encodeURIComponent(callback)}`, {
      method: 'POST',
      body: JSON.stringify({ email, password: TEST_PASSWORD, data: { locale: 'en' } }),
    })
    expect(response.status).toBe(200)
    deleteLater(((await response.json()) as { id: string }).id)

    const [mail] = await waitForMail(email)
    expect(mail?.Subject).toBe('Confirm your email address')
    expect(mail?.HTML).toContain('Confirm email address')

    const link = verifyLinkIn(mail!)
    expect(new URL(link).searchParams.get('type')).toBe('signup')
    expect(await follow(link)).toContain(callback)
    await expect(signIn(email)).resolves.toBeTypeOf('string')
  })

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
      .set('Authorization', `Bearer ${token}`)
      .send({ locale: 'en' })
      .expect(200)

    const response = await auth(`/recover?redirect_to=${encodeURIComponent(callback)}`, {
      method: 'POST',
      body: JSON.stringify({ email: account.email }),
    })
    expect(response.status).toBe(200)

    const [mail] = await waitForMail(account.email)
    expect(mail?.Subject).toBe('Reset your password')
    const link = verifyLinkIn(mail!)
    expect(new URL(link).searchParams.get('type')).toBe('recovery')
    expect(await follow(link)).toContain('access_token=')
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

    await follow(verifyLinkIn(current!))
    await follow(verifyLinkIn(incoming!))
    await expect(signIn(next)).resolves.toBeTypeOf('string')
  })
})

describe('POST /hooks/send-email', () => {
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
})
