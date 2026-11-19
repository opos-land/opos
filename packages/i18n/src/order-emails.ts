import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { formatMoney } from './format'
import type { Locale } from './locales'

// The emails of an order (docs/specs/0004-checkout-and-orders.md, Emails): each has a fixed text
// with the convention's name, and the API renders it in its recipient's locale.

/** A label that is either one of the shop's own sentences or a name the convention wrote. */
type Label = MessageDescriptor | string

/** A part of an email of an order, in the order it is read. */
export type EmailPart =
  | { kind: 'paragraph'; text: MessageDescriptor }
  | { kind: 'heading'; text: MessageDescriptor }
  /** Labels with their values, such as the lines of an order with their amounts. */
  | { kind: 'rows'; rows: readonly { label: Label; value: string; strong?: boolean }[] }
  | { kind: 'link'; label: Label; url: string }
  /** A picture that travels with the email under `cid`, and what it holds as text below it. */
  | { kind: 'image'; cid: string; alt: MessageDescriptor; caption: string }
  /** What the convention or its payment provider wrote, shown as it is. */
  | { kind: 'quote'; lines: readonly string[] }

export interface OrderEmailContent {
  subject: MessageDescriptor
  parts: readonly EmailPart[]
}

/** The order an email is about. */
export interface OrderOf {
  conventionName: string
  number: string
}

export interface ConfirmationData extends OrderOf {
  /** The language its amounts are written in: the recipient's. */
  locale: Locale
  currency: string
  totalMinor: number
  lines: readonly { name: string; quantity: number; amountMinor: number }[]
  /** Whether the order holds merchandise, which is picked up at the edition. */
  picksUp: boolean
  /** The QR code as text; its picture travels with the email under `qrCodeCid`. */
  qrCode: string
  qrCodeCid: string
  orderLink: string
  /** For an email with an account: where its owner signs in to see the order. */
  signInLink: string | null
  seller: { name: string; address: string; registrationNumber: string; contactEmail: string }
  /** The versions of the documents the buyer accepted, each under its title. */
  documents: readonly { title: string; url: string }[]
  /** For a teen as the ticket holder: the guardian consent form, when the edition set one. */
  guardianConsent: { formUrl: string | null } | null
}

/** An order became "Paid": what was bought, the QR code and the way back to the order. */
export function orderConfirmationEmail(data: ConfirmationData): OrderEmailContent {
  const { conventionName, number } = data
  const money = (amountMinor: number) => formatMoney(amountMinor, data.currency, data.locale)
  return {
    subject: msg`Your order ${number} for ${conventionName} is paid`,
    parts: [
      {
        kind: 'paragraph',
        text: msg`Thank you. Your order ${number} for ${conventionName} is paid.`,
      },
      { kind: 'heading', text: msg`Your order` },
      {
        kind: 'rows',
        rows: [
          ...data.lines.map((line) => ({
            label: line.quantity > 1 ? `${line.quantity} × ${line.name}` : line.name,
            value: money(line.amountMinor),
          })),
          { label: msg`Total`, value: money(data.totalMinor), strong: true },
        ],
      },
      { kind: 'heading', text: msg`Your QR code` },
      {
        kind: 'paragraph',
        text: msg`Show this QR code at the convention: it is how your order is found there.`,
      },
      {
        kind: 'image',
        cid: data.qrCodeCid,
        alt: msg`The QR code of the order ${number}`,
        caption: data.qrCode,
      },
      ...(data.picksUp
        ? [
            {
              kind: 'paragraph' as const,
              text: msg`Merchandise is picked up at the convention. Nothing is sent by post.`,
            },
          ]
        : []),
      { kind: 'link', label: msg`See your order`, url: data.orderLink },
      ...(data.signInLink
        ? [
            {
              kind: 'paragraph' as const,
              text: msg`This email address has an OPOS account. Sign in to see the order among your orders.`,
            },
            { kind: 'link' as const, label: msg`Sign in`, url: data.signInLink },
          ]
        : []),
      ...(data.guardianConsent
        ? [
            { kind: 'heading' as const, text: msg`Guardian consent` },
            {
              kind: 'paragraph' as const,
              text: msg`The ticket holder is under 18 and over the age of a child: bring the guardian's consent on paper to the convention.`,
            },
            ...(data.guardianConsent.formUrl
              ? [
                  {
                    kind: 'link' as const,
                    label: msg`Download the guardian consent form`,
                    url: data.guardianConsent.formUrl,
                  },
                ]
              : []),
          ]
        : []),
      ...(data.documents.length > 0
        ? [
            { kind: 'heading' as const, text: msg`Documents you accepted` },
            ...data.documents.map((document) => ({
              kind: 'link' as const,
              label: document.title,
              url: document.url,
            })),
          ]
        : []),
      { kind: 'heading', text: msg`Seller` },
      {
        kind: 'quote',
        lines: [
          data.seller.name,
          data.seller.address,
          data.seller.registrationNumber,
          data.seller.contactEmail,
        ].filter((line) => line !== ''),
      },
    ],
  }
}

/** An unpaid order expired: nothing was charged, and the shop is one link away. */
export const orderExpiredEmail = ({
  conventionName,
  number,
  shopLink,
}: OrderOf & { shopLink: string }): OrderEmailContent => ({
  subject: msg`Your order ${number} for ${conventionName} has expired`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`Your order ${number} for ${conventionName} was not paid in time and has expired. Nothing was charged.`,
    },
    { kind: 'link', label: msg`Start a new order`, url: shopLink },
  ],
})

/** An order went to "Needs review": to its buyer, with where the money is. */
export const paymentUnderReviewEmail = ({
  conventionName,
  number,
  moneyWith,
  contactEmail,
}: OrderOf & { moneyWith: string | null; contactEmail: string }): OrderEmailContent => ({
  subject: msg`Your payment for the order ${number} is under review`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`Your payment for the order ${number} for ${conventionName} arrived, but it could not confirm the order, so an organizer has to look at it.`,
    },
    ...(moneyWith ? [{ kind: 'quote' as const, lines: [moneyWith] }] : []),
    {
      kind: 'paragraph',
      text: msg`An organizer of ${conventionName} will get in touch with you. You do not need to pay again. You can also write to ${contactEmail}.`,
    },
  ],
})

/** An order went to "Needs review": to its orgs, with what did not match. */
export function needsReviewEmail(
  data: OrderOf & {
    locale: Locale
    currency: string
    /** The amount differs from the total, or the order had expired and what it held is gone. */
    cause: 'amount' | 'gone'
    paidMinor: number
    totalMinor: number
  },
): OrderEmailContent {
  const { conventionName, number } = data
  const paid = formatMoney(data.paidMinor, data.currency, data.locale)
  const total = formatMoney(data.totalMinor, data.currency, data.locale)
  return {
    subject: msg`The order ${number} of ${conventionName} needs review`,
    parts: [
      {
        kind: 'paragraph',
        text: msg`A payment arrived for the order ${number} of ${conventionName} and could not confirm it.`,
      },
      {
        kind: 'paragraph',
        text:
          data.cause === 'amount'
            ? msg`The amount paid, ${paid}, differs from the total of the order, ${total}.`
            : msg`The order had expired, and what it held is no longer available.`,
      },
      {
        kind: 'paragraph',
        text: msg`The money is with the convention. The order waits for an organizer to settle it.`,
      },
    ],
  }
}

/** An order got a payment it no longer needed: to its buyer, with where the money is. */
export const paymentNotNeededEmail = ({
  conventionName,
  number,
  moneyWith,
  contactEmail,
}: OrderOf & { moneyWith: string | null; contactEmail: string }): OrderEmailContent => ({
  subject: msg`A payment arrived that your order ${number} does not need`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`A payment arrived for your order ${number} for ${conventionName}, which was not waiting for one any more. It changes nothing of the order.`,
    },
    ...(moneyWith ? [{ kind: 'quote' as const, lines: [moneyWith] }] : []),
    { kind: 'paragraph', text: msg`If you have questions, write to ${contactEmail}.` },
  ],
})

/** Such a payment could not be refused: to the orgs, who return it. */
export function paymentNotNeededOrgsEmail(
  data: OrderOf & {
    locale: Locale
    currency: string
    paidMinor: number
    providerReference: string | null
  },
): OrderEmailContent {
  const { conventionName, number } = data
  const paid = formatMoney(data.paidMinor, data.currency, data.locale)
  const reference = data.providerReference ?? ''
  return {
    subject: msg`The order ${number} of ${conventionName} got a payment it does not need`,
    parts: [
      {
        kind: 'paragraph',
        text: msg`A payment of ${paid} arrived for the order ${number} of ${conventionName}, which was not waiting for one, and the payment provider could not refuse it.`,
      },
      {
        kind: 'paragraph',
        text: msg`The money is with the convention. Return it to the buyer at the payment provider.`,
      },
      ...(data.providerReference
        ? [
            {
              kind: 'paragraph' as const,
              text: msg`The payment provider's number of the transaction: ${reference}`,
            },
          ]
        : []),
    ],
  }
}
