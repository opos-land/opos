import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ACCESS_TOKEN_VERIFIER, type AccessTokenVerifier } from '../src/common/guards/access-token'
import { createApp } from './app'
import {
  createAccount,
  deleteCreatedAccounts,
  foreignKey,
  mintToken,
  signIn,
  unsignedToken,
} from './auth'

let app: NestExpressApplication
let token: string
let accountId: string

beforeAll(async () => {
  app = await createApp()
  // One listening server for the whole file: concurrent supertest calls then share it.
  await app.listen(0, '127.0.0.1')
  const account = await createAccount({ first_name: 'Anna', last_name: 'Nowak' })
  accountId = account.id
  token = await signIn(account.email)
})

afterAll(async () => {
  await deleteCreatedAccounts()
  await app.close()
})

const me = () => request(app.getHttpServer()).get('/me')

describe('JwtAuthGuard', () => {
  it('accepts a Supabase Auth session and returns the account', async () => {
    const res = await me().set('Authorization', `Bearer ${token}`).expect(200)

    expect(res.body).toMatchObject({
      id: accountId,
      firstName: 'Anna',
      lastName: 'Nowak',
      locale: null,
    })
  })

  it('rejects a request without a token', async () => {
    const res = await me().expect(401)

    const body = res.body as { code: string; message: unknown }
    expect(body.code).toBe('session.invalid')
    expect(typeof body.message).toBe('string')
  })

  it('accepts a token signed with the local key the stack publishes', async () => {
    const res = await me()
      .set('Authorization', `Bearer ${await mintToken({ sub: accountId })}`)
      .expect(200)

    expect(res.body).toMatchObject({ id: accountId })
  })

  it.each([
    ['an expired token', () => mintToken({ sub: accountId, expiresIn: '-1m' })],
    [
      'a token signed with a foreign ES256 key',
      async () => mintToken({ sub: accountId }, await foreignKey()),
    ],
    [
      'an HS256 token with any secret',
      () => mintToken({ sub: accountId, alg: 'HS256' }, new TextEncoder().encode('x'.repeat(32))),
    ],
    ['a token for another audience', () => mintToken({ sub: accountId, aud: 'anon' })],
    ['a token from another issuer', () => mintToken({ sub: accountId, iss: 'https://evil.test' })],
    ['a valid token without an accounts row', () => mintToken()],
    ['a token without exp', () => mintToken({ sub: accountId, expiresIn: null })],
    ['an anonymous token', () => mintToken({ sub: accountId, is_anonymous: true })],
    ['an unsigned token', () => Promise.resolve(unsignedToken(accountId))],
    ['a sub that is not a uuid', () => mintToken({ sub: 'not-a-uuid' })],
  ])('rejects %s', async (_, makeToken) => {
    const res = await me()
      .set('Authorization', `Bearer ${await makeToken()}`)
      .expect(401)

    expect(res.body).toMatchObject({ code: 'session.invalid' })
  })

  it('answers 503 with Retry-After when the signing keys cannot be fetched', async () => {
    const cut = await createApp({ SUPABASE_URL: 'http://127.0.0.1:1' })
    try {
      const res = await request(cut.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(503)

      expect(res.body).toMatchObject({ code: 'server.unavailable' })
      expect(res.headers['retry-after']).toBe('30')
    } finally {
      await cut.close()
    }
  })

  it('closes the signing key refresh with the application', async () => {
    const closing = await createApp()
    const verifier = closing.get<AccessTokenVerifier>(ACCESS_TOKEN_VERIFIER)
    const close = vi.spyOn(verifier, 'close')

    await closing.close()

    expect(close).toHaveBeenCalledOnce()
  })
})

describe('PATCH /me', () => {
  const patch = (body: object) =>
    request(app.getHttpServer()).patch('/me').set('Authorization', `Bearer ${token}`).send(body)

  it('changes the names and the locale', async () => {
    const res = await patch({ firstName: '  Ewa ', locale: 'en' }).expect(200)

    expect(res.body).toMatchObject({ firstName: 'Ewa', lastName: 'Nowak', locale: 'en' })
    expect((await me().set('Authorization', `Bearer ${token}`)).body).toMatchObject({
      locale: 'en',
    })
  })

  it('resets the locale to detection with null', async () => {
    const res = await patch({ locale: null }).expect(200)

    expect(res.body).toMatchObject({ locale: null })
  })

  it.each([
    [{ locale: 'cs' }, 'locale'],
    [{ firstName: '' }, 'firstName'],
    [{ email: 'other@example.test' }, 'email'],
  ])('refuses %o', async (body, field) => {
    const res = await patch(body).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field } })
  })
})

describe('two accounts', () => {
  it('keeps every request on its own account', async () => {
    const other = await createAccount({ first_name: 'Jan' })
    const otherToken = await signIn(other.email)

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        me().set('Authorization', `Bearer ${i % 2 ? otherToken : token}`),
      ),
    )

    responses.forEach((res, i) => {
      expect((res.body as { id: string }).id).toBe(i % 2 ? other.id : accountId)
    })
  })

  it('leaves another account alone on PATCH /me', async () => {
    const other = await createAccount({ first_name: 'Jan' })
    const otherToken = await signIn(other.email)

    await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Changed' })
      .expect(200)

    const res = await me().set('Authorization', `Bearer ${otherToken}`).expect(200)
    expect(res.body).toMatchObject({ firstName: 'Jan' })
  })
})

describe('errors', () => {
  it('answers an unknown route in the error format', async () => {
    const res = await request(app.getHttpServer()).get('/no-such-route').expect(404)

    expect(res.body).toMatchObject({ code: 'request.not-found' })
  })

  it('refuses a body of another type before any handler reads it', async () => {
    for (const type of ['text/plain', 'application/octet-stream', 'application/json-x']) {
      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', type)
        .send('locale=en')
        .expect(415)

      expect(res.body).toMatchObject({ code: 'request.invalid' })
    }
  })

  it('answers a body that is not JSON in the error format', async () => {
    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{not json')
      .expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
  })
})
