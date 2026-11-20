import { LEFT_OUT } from '@opos/contract'

/** What an email said as it is kept on its row: its subject and its text. */
export interface KeptEmail {
  subject: string
  body: string
}

/**
 * What is kept of an email that goes out (docs/specs/0006-order-management.md, F4): its subject
 * and its text as they are written for keeping, with every value that hands the order over left
 * out. Those are the QR code and the token of an order link: the code is shown to its buyer
 * alone, and of a link only the hash is kept, so an org that reads the email reads neither.
 */
export function keptOf(
  sent: { subject: string; text: string },
  handedOver: readonly string[],
): KeptEmail {
  const without = (text: string) =>
    handedOver
      .filter((value) => value !== '')
      .reduce((left, value) => left.replaceAll(value, LEFT_OUT), text)
  return { subject: without(sent.subject), body: without(sent.text) }
}
