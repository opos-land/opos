import { describe, expect, it } from 'vitest'
import { keptOf } from './kept-email'

const CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const TOKEN = 'k3pt-n0where_k3pt-n0where_k3pt-n0where_k3pt'

describe('what is kept of a sent email', () => {
  it('is its subject and its text, with nothing of what hands the order over', () => {
    const sent = {
      subject: 'Your order ABCDEFGH23 is paid',
      text: [
        `The QR code of the order ABCDEFGH23: ${CODE}`,
        `See your order: https://portal.test/order#${TOKEN}`,
        'OPOS',
      ].join('\n\n'),
    }

    expect(keptOf(sent, [CODE, TOKEN])).toEqual({
      subject: 'Your order ABCDEFGH23 is paid',
      body: [
        'The QR code of the order ABCDEFGH23: […]',
        'See your order: https://portal.test/order#[…]',
        'OPOS',
      ].join('\n\n'),
    })
  })

  it('leaves out every place a code or a token stands in, the subject among them', () => {
    const kept = keptOf({ subject: `Code ${CODE}`, text: `${CODE}\n${TOKEN} and ${CODE} again` }, [
      CODE,
      TOKEN,
    ])

    expect(kept).toEqual({ subject: 'Code […]', body: '[…]\n[…] and […] again' })
  })

  it('keeps an email that hands nothing over as it went out', () => {
    const sent = { subject: 'Your order has expired', text: 'Nothing was charged.\n\nOPOS' }

    expect(keptOf(sent, [])).toEqual({ subject: sent.subject, body: sent.text })
    // Nothing to leave out is no pattern that every place of the text answers to.
    expect(keptOf(sent, [''])).toEqual({ subject: sent.subject, body: sent.text })
  })
})
