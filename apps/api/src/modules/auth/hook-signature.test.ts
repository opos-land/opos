import { randomUUID } from 'node:crypto'
import { Webhook } from 'standardwebhooks'
import { describe, expect, it } from 'vitest'
import { verifyHookSignature } from './hook-signature'

const secret = `v1,whsec_${Buffer.from('unit-test-send-email-hook-secret').toString('base64')}`
const other = `v1,whsec_${Buffer.from('another-send-email-hook-secret!!').toString('base64')}`
const payload = JSON.stringify({ user: { id: randomUUID() }, email_data: {} })

const sign = (body: string, key = secret, at = new Date()) => {
  const id = `msg_${randomUUID()}`
  return {
    'webhook-id': id,
    'webhook-timestamp': String(Math.floor(at.getTime() / 1000)),
    'webhook-signature': new Webhook(key.replace(/^v1,/, '')).sign(id, at, body),
  }
}

describe('verifyHookSignature', () => {
  it('returns the parsed body of a correctly signed request', () => {
    expect(verifyHookSignature(secret, Buffer.from(payload), sign(payload))).toEqual(
      JSON.parse(payload),
    )
  })

  it('refuses a request signed with another secret', () => {
    expect(verifyHookSignature(secret, Buffer.from(payload), sign(payload, other))).toBeUndefined()
  })

  it('refuses a body changed after signing', () => {
    const tampered = payload.replace('"email_data":{}', '"email_data":{"x":1}')
    expect(verifyHookSignature(secret, Buffer.from(tampered), sign(payload))).toBeUndefined()
  })

  it('refuses a signature older than five minutes', () => {
    const headers = sign(payload, secret, new Date(Date.now() - 10 * 60_000))
    expect(verifyHookSignature(secret, Buffer.from(payload), headers)).toBeUndefined()
  })

  it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'] as const)(
    'refuses a request without %s',
    (name) => {
      const headers: Record<string, string | undefined> = sign(payload)
      headers[name] = undefined
      expect(verifyHookSignature(secret, Buffer.from(payload), headers)).toBeUndefined()
    },
  )

  it('refuses a request without a body', () => {
    expect(verifyHookSignature(secret, undefined, sign(payload))).toBeUndefined()
  })
})
