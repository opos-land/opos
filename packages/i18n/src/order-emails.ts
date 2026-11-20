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
  /** What a discount code took off, below zero; null for an order that used none. */
  discountMinor: number | null
  /** Whether the order holds merchandise, which is picked up at the edition. */
  picksUp: boolean
  /** The QR code as text; its picture travels with the email under `qrCodeCid`. */
  qrCode: string
  qrCodeCid: string
  orderLink: string
  /** For an email with an account: where its owner signs in to see the order. */
  signInLink: string | null
  /** The seller's details; null while the convention's are not complete. */
  seller: {
    name: string
    address: string
    registrationNumber: string
    contactEmail: string
  } | null
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
          ...(data.discountMinor !== null && data.discountMinor !== 0
            ? [{ label: msg`Discount`, value: money(data.discountMinor) }]
            : []),
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
              text: msg`The ticket holder is a teen: the guardian's consent has to be brought on paper to the convention.`,
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
      ...(data.seller
        ? [
            { kind: 'heading' as const, text: msg`Seller` },
            {
              kind: 'quote' as const,
              lines: [
                data.seller.name,
                data.seller.address,
                data.seller.registrationNumber,
                data.seller.contactEmail,
              ],
            },
          ]
        : []),
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
}: OrderOf & { moneyWith: string | null; contactEmail: string | null }): OrderEmailContent => ({
  subject: msg`Your payment for the order ${number} is under review`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`Your payment for the order ${number} for ${conventionName} arrived, but it could not confirm the order, so an organizer has to look at it.`,
    },
    ...(moneyWith ? [{ kind: 'quote' as const, lines: [moneyWith] }] : []),
    {
      kind: 'paragraph',
      text: msg`An organizer of ${conventionName} will get in touch with you. You do not need to pay again.`,
    },
    ...(contactEmail
      ? [{ kind: 'paragraph' as const, text: msg`You can also write to ${contactEmail}.` }]
      : []),
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
}: OrderOf & { moneyWith: string | null; contactEmail: string | null }): OrderEmailContent => ({
  subject: msg`A payment arrived that your order ${number} does not need`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`A payment arrived for your order ${number} for ${conventionName}, which was not waiting for one any more. It changes nothing of the order.`,
    },
    ...(moneyWith ? [{ kind: 'quote' as const, lines: [moneyWith] }] : []),
    ...(contactEmail
      ? [
          {
            kind: 'paragraph' as const,
            text: msg`If you have questions, write to ${contactEmail}.`,
          },
        ]
      : []),
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

// What an org's work on an order tells its buyer (docs/specs/0006-order-management.md, Emails).

/** Whom the buyer writes to about a change: the convention's contact, when it gave one. */
interface Contact {
  contactEmail: string | null
}

/** For a change the buyer may not have asked for. */
const notAsked = ({ contactEmail }: Contact): EmailPart[] =>
  contactEmail
    ? [
        {
          kind: 'paragraph',
          text: msg`If you did not ask for this change, write to ${contactEmail}.`,
        },
      ]
    : []

const nothingElse: EmailPart = {
  kind: 'paragraph',
  text: msg`Nothing else of the order changed, and your QR code stays the same.`,
}

/** An org corrected the ticket holder's name: nothing else changed. */
export const orderHolderChangedEmail = ({
  conventionName,
  number,
  holderName,
  contactEmail,
}: OrderOf & Contact & { holderName: string }): OrderEmailContent => ({
  subject: msg`The ticket holder of your order ${number} was changed`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`An organizer of ${conventionName} changed the ticket holder of your order ${number}.`,
    },
    { kind: 'rows', rows: [{ label: msg`Ticket holder`, value: holderName }] },
    nothingElse,
    ...notAsked({ contactEmail }),
  ],
})

/** An org swapped a variant of a merchandise line: the merchandise the order holds now. */
export const orderVariantChangedEmail = ({
  conventionName,
  number,
  merchandise,
  contactEmail,
}: OrderOf &
  Contact & {
    merchandise: readonly { name: string; quantity: number }[]
  }): OrderEmailContent => ({
  subject: msg`The merchandise of your order ${number} was changed`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`An organizer of ${conventionName} swapped a variant of the merchandise in your order ${number}. This is the merchandise the order holds now:`,
    },
    ...(merchandise.length > 0
      ? [
          {
            kind: 'quote' as const,
            lines: merchandise.map((line) =>
              line.quantity > 1 ? `${line.quantity} × ${line.name}` : line.name,
            ),
          },
        ]
      : []),
    nothingElse,
    ...notAsked({ contactEmail }),
  ],
})

/** An org changed the order's email: to the new address, with the new QR code and order link. */
export const orderEmailChangedEmail = ({
  conventionName,
  number,
  qrCode,
  qrCodeCid,
  orderLink,
  contactEmail,
}: OrderOf &
  Contact & {
    /** The new QR code as text; its picture travels with the email under `qrCodeCid`. */
    qrCode: string
    qrCodeCid: string
    orderLink: string
  }): OrderEmailContent => ({
  subject: msg`Your order ${number} for ${conventionName} is now under this email address`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`An organizer of ${conventionName} moved the order ${number} to this email address.`,
    },
    { kind: 'heading', text: msg`Your QR code` },
    {
      kind: 'paragraph',
      text: msg`This is the new QR code of the order. The one sent before no longer works.`,
    },
    {
      kind: 'image',
      cid: qrCodeCid,
      alt: msg`The QR code of the order ${number}`,
      caption: qrCode,
    },
    { kind: 'link', label: msg`See your order`, url: orderLink },
    ...notAsked({ contactEmail }),
  ],
})

/** The same change, to the old address: what was sent there no longer works. */
export const orderEmailReplacedEmail = ({
  conventionName,
  number,
  contactEmail,
}: OrderOf & Contact): OrderEmailContent => ({
  subject: msg`Your order ${number} for ${conventionName} was moved to another email address`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`An organizer of ${conventionName} moved the order ${number} to another email address. The QR code and the order link sent to this address no longer work.`,
    },
    ...notAsked({ contactEmail }),
  ],
})

/**
 * A fresh order link for one that expired (docs/specs/0009-buyer-self-service.md, K4), sent to
 * the order's email whoever asked: it carries the link alone, never the QR code.
 */
export const orderLinkEmail = ({
  conventionName,
  number,
  orderLink,
  contactEmail,
}: OrderOf & Contact & { orderLink: string }): OrderEmailContent => ({
  subject: msg`A new link to your order ${number} for ${conventionName}`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`Someone asked for a new link to the order ${number} for ${conventionName}. It opens the order without a sign-in, so keep it to yourself.`,
    },
    { kind: 'link', label: msg`See your order`, url: orderLink },
    {
      kind: 'paragraph',
      text: contactEmail
        ? msg`If you did not ask for it, you can ignore this email: the order is as it was. With questions, write to ${contactEmail}.`
        : msg`If you did not ask for it, you can ignore this email: the order is as it was.`,
    },
  ],
})

/** An org declined an order that needed review: where the money is, and whom to write to. */
export const orderDeclinedEmail = ({
  conventionName,
  number,
  moneyWith,
  contactEmail,
}: OrderOf & Contact & { moneyWith: string | null }): OrderEmailContent => ({
  subject: msg`The payment for your order ${number} was declined`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`An organizer of ${conventionName} looked at your payment for the order ${number} and declined it. The order is not paid and gets no QR code.`,
    },
    ...(moneyWith ? [{ kind: 'quote' as const, lines: [moneyWith] }] : []),
    ...(contactEmail
      ? [
          {
            kind: 'paragraph' as const,
            text: msg`To settle the return of the money, write to ${contactEmail}.`,
          },
        ]
      : []),
  ],
})

/** An org canceled a paid order of the shop: its QR code is no longer valid. */
export const orderCanceledEmail = ({
  conventionName,
  number,
  contactEmail,
}: OrderOf & Contact): OrderEmailContent => ({
  subject: msg`Your order ${number} for ${conventionName} was canceled`,
  parts: [
    {
      kind: 'paragraph',
      text: msg`An organizer of ${conventionName} canceled your order ${number}. Its QR code is no longer valid.`,
    },
    ...(contactEmail
      ? [
          {
            kind: 'paragraph' as const,
            text: msg`If you have questions about the order or its payment, write to ${contactEmail}.`,
          },
        ]
      : []),
  ],
})
