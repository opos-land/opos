import { describe, expect, it } from 'vitest'
import { mailFailure } from './mail-failure'

describe('mailFailure', () => {
  it("names nodemailer's code and response code, never the SMTP reply in its message", () => {
    const refused = Object.assign(
      new Error('Can not send: 550 <anna.secret@example.test> unknown'),
      {
        code: 'EENVELOPE',
        responseCode: 550,
        response: '550 <anna.secret@example.test> unknown',
        rejected: ['anna.secret@example.test'],
      },
    )

    expect(mailFailure(refused)).toBe('Error, code EENVELOPE, response 550')
  })

  it('says what is missing', () => {
    expect(mailFailure(new TypeError('anna.secret@example.test'))).toBe(
      'TypeError, code none, response none',
    )
  })

  it.each([undefined, null, 'anna.secret@example.test', 7])('takes a thrown %s', (thrown) => {
    expect(mailFailure(thrown)).toBe('unknown failure, code none, response none')
  })

  it.each([
    [{ code: 7, responseCode: '550' }],
    [{ code: { address: 'anna.secret@example.test' }, responseCode: null }],
  ])('ignores values of another type: %o', (error) => {
    expect(mailFailure(error)).toBe('unknown failure, code none, response none')
  })
})
