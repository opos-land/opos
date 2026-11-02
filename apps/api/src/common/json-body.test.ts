import { describe, expect, it } from 'vitest'

import { requireJsonBody } from './json-body'

function run(headers: Record<string, string>) {
  const outcome: { next: boolean; status?: number } = { next: false }
  requireJsonBody(
    { headers },
    {
      status(code) {
        outcome.status = code
        return { json() {} }
      },
    },
    () => {
      outcome.next = true
    },
  )
  return outcome
}

describe('requireJsonBody', () => {
  it.each([
    ['application/json', true],
    ['application/json; charset=utf-8', true],
    ['APPLICATION/JSON', true],
    ['application/json-x', false],
    ['application/json.evil', false],
    ['application/json/x', false],
    ['application/jsonx', false],
    ['text/plain', false],
    ['', false],
  ])('a body of type %s passes: %s', (type, passes) => {
    const outcome = run({ 'content-type': type, 'content-length': '2' })
    expect(outcome.next).toBe(passes)
    expect(outcome.status).toBe(passes ? undefined : 415)
  })

  it('lets a request without a body through, whatever its type', () => {
    expect(run({ 'content-type': 'text/plain' }).next).toBe(true)
  })

  it('treats a chunked body as a body', () => {
    expect(run({ 'transfer-encoding': 'chunked' }).status).toBe(415)
  })
})
