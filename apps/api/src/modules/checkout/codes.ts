import { createHash, randomBytes, randomInt } from 'node:crypto'
import { ORDER_NUMBER_ALPHABET, ORDER_NUMBER_LENGTH } from '@opos/contract'

/**
 * A number for an order: ten characters drawn at random, none mistaken for another. It carries no
 * personal data and does not tell how many orders came before it.
 */
export const orderNumber = () =>
  Array.from(
    { length: ORDER_NUMBER_LENGTH },
    () => ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)],
  ).join('')

/** A token nobody can guess: 256 random bits, as text a header or a link carries. */
export const secretToken = () => randomBytes(32).toString('base64url')

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * A QR code's text: 160 random bits in capitals and digits, which a QR code holds most densely
 * and a person can read out at the desk.
 */
export const qrCode = () =>
  Array.from(randomBytes(32), (byte) => BASE32[byte % BASE32.length]).join('')

/** What a secret is stored and found by: its hash, which gives nothing of it back. */
export const hashOf = (secret: string) => createHash('sha256').update(secret).digest('hex')
