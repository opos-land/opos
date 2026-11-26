import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { open, orderQrCodeOf, sealingKey } from '@opos/db/sealed'
import { HANDING_OVER_EMAIL_KINDS } from '@opos/contract'
import { type Locale } from '@opos/i18n'
import {
  needsReviewEmail,
  orderCanceledEmail,
  orderConfirmationEmail,
  orderDeclinedEmail,
  orderEmailChangedEmail,
  type OrderEmailContent,
  orderEmailReplacedEmail,
  orderExpiredEmail,
  orderHolderChangedEmail,
  orderLinkEmail,
  orderVariantChangedEmail,
  paymentNotNeededEmail,
  paymentNotNeededOrgsEmail,
  paymentUnderReviewEmail,
  preEditionReminderEmail,
} from '@opos/i18n/order-emails'
import { toBuffer } from 'qrcode'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService, type JobScope } from '../../common/database/global-db.service'
import { ENV, type Env } from '../../config/env'
import { mailFailure } from '../mail/mail-failure'
import { MailService } from '../mail/mail.service'
import { recipientLocale } from '../mail/recipient-locale'
import { PaymentProviders } from '../payments/payment-providers'
import { hashOf, secretToken } from './codes'
import { type KeptEmail, keptOf } from './kept-email'
import { OfferRepository } from './offer.repository'
import { type ClaimedEmail, OrderEmailsRepository } from './order-emails.repository'

/** How often the outbox looks for emails that are due. */
const OUTBOX_EVERY_MS = 15_000

/** How long a claimed email is this process's alone: longer than a send may take. */
const LEASE_MS = 5 * 60_000

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/**
 * An order link is valid until this long after its edition ends (buyer self-service, K3). One
 * sent later than that, a fresh link for an expired one among them, opens this long from its
 * sending.
 */
export const ORDER_LINK_DAYS = 30

/** The content id the picture of a QR code travels under. */
const QR_CODE_CID = 'qr-code@opos'

/** What writing an email answers when the email is not to be sent. */
const WITHDRAWN = 'withdrawn'

/** The emails that say an order is paid and carry its QR code. */
const OF_A_PAID_ORDER: readonly ClaimedEmail['kind'][] = [
  'order-confirmation',
  'order-email-changed',
]

/**
 * How long a failed send waits for its next try, by how many tries have failed: a minute, then
 * twice as long each time, up to six hours.
 */
export const retryDelayMs = (failedAttempts: number) =>
  Math.min(2 ** Math.max(failedAttempts - 1, 0), 360) * MINUTE

interface Picture {
  cid: string
  filename: string
  content: Buffer
}

/** Whom an email is written for: the language it is in, and where an account signs in. */
interface Reader {
  locale: Locale
  /** For the address of the account the order is on; null for any other. */
  signInLink: string | null
}

/** What an email says, to be written for a reader, with the pictures that travel with it. */
interface Written {
  write: (reader: Reader) => OrderEmailContent
  pictures?: Picture[]
}

interface Composed {
  to: string
  locale: Locale
  content: OrderEmailContent
  /** The same email as it is kept: written for a reader of whom nothing is told. */
  kept: { locale: Locale; content: OrderEmailContent }
  pictures?: Picture[]
}

type OrderOfEmail = NonNullable<Awaited<ReturnType<OrderEmailsRepository['order']>>>

/**
 * The outbox of the orders' emails (docs/specs/0004-checkout-and-orders.md, Emails, Jobs). An
 * email is queued in the transaction of its cause; this job sends what is due, in its recipient's
 * language or the convention's for an address with no account, marks it sent, and tries a failed
 * send again after a growing delay, so no email is lost to one. Sending is outbound I/O and runs
 * outside every transaction: an email is claimed first, for this process alone, under a lock
 * another process skips. What a sent email said is kept on its row, written in the convention's
 * language, without what hands the order over and with no word of an account
 * (docs/specs/0006-order-management.md, F4).
 */
@Injectable()
export class OrderEmailsOutbox implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OrderEmailsOutbox.name)
  private readonly key: Buffer
  private readonly apiUrl: string
  private readonly portalUrl: string
  private timer?: NodeJS.Timeout

  constructor(
    private readonly global: GlobalDbService,
    private readonly emails: OrderEmailsRepository,
    private readonly offers: OfferRepository,
    private readonly providers: PaymentProviders,
    private readonly mail: MailService,
    private readonly context: TenantContextService,
    @Inject(ENV) env: Pick<Env, 'API_URL' | 'PORTAL_URL' | 'PAYMENT_CREDENTIALS_KEY'>,
  ) {
    this.key = sealingKey(env.PAYMENT_CREDENTIALS_KEY)
    this.apiUrl = env.API_URL.replace(/\/+$/, '')
    this.portalUrl = env.PORTAL_URL.replace(/\/+$/, '')
  }

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return
    const run = () => {
      this.run()
        .catch((error: unknown) => this.logger.error(`The outbox failed: ${String(error)}`))
        .finally(() => (this.timer = setTimeout(run, OUTBOX_EVERY_MS).unref()))
    }
    this.timer = setTimeout(run, OUTBOX_EVERY_MS).unref()
  }

  onApplicationShutdown() {
    clearTimeout(this.timer)
  }

  /** One run over the emails due by `now`. */
  async run(now = new Date(), scope: JobScope = {}): Promise<{ sent: number; failed: number }> {
    const result = { sent: 0, failed: 0 }
    for (const { id, tenantId } of await this.global.emailsDue(now, scope)) {
      try {
        const outcome = await this.one(tenantId, id, now)
        if (outcome) result[outcome] += 1
      } catch (error) {
        // One email that cannot be taken, such as one of a tenant suspended meanwhile, leaves
        // the rest. Nothing of the message goes to the log: it may quote an address.
        const name = error instanceof Error ? error.name : 'unknown failure'
        this.logger.warn(`The outbox left the email ${id} as it was: ${name}`)
      }
    }
    return result
  }

  private async one(
    tenantId: string,
    emailId: string,
    now: Date,
  ): Promise<'sent' | 'failed' | undefined> {
    // What the email hands the order over with: a QR code, the token of an order link. Each is
    // noted as it is made, so that nothing of it is kept with what the email said.
    const handedOver: string[] = []
    const claimed = await this.context.withTenant(tenantId, async () => {
      // The lease runs from the claim, not from `now`: a long run claims its last emails minutes
      // after it began.
      const email = await this.emails.claim(emailId, now, new Date(Date.now() + LEASE_MS))
      if (!email) return undefined
      // An email that cannot be written is tried again later, as one that could not be sent.
      const composed = await this.compose(email, now, handedOver).catch((error: unknown) => {
        // Only the error's name: the message of a failed query quotes its parameters, an
        // address among them.
        const name = error instanceof Error ? error.name : 'unknown failure'
        this.logger.error(`The email ${emailId} could not be written: ${name}`)
        return undefined
      })
      return { email, composed }
    })
    // Sent, or taken by another process, since it was found.
    if (!claimed) return undefined
    const { email, composed } = claimed
    // Withdrawn while it was written: it goes nowhere, and is not tried again.
    if (composed === WITHDRAWN) return undefined
    let said: KeptEmail
    try {
      if (!composed) throw new Error('The email could not be written')
      // Written before the email goes out: a text that cannot be written sends nothing, so no
      // email goes out twice for it.
      said = keptOf(await this.mail.orderEmailText(composed.kept), handedOver)
      await this.mail.sendOrderEmail(composed)
    } catch (error) {
      const next = new Date(Date.now() + retryDelayMs(email.failedAttempts + 1))
      await this.context.withTenant(tenantId, () => this.emails.failed(emailId, next))
      this.logger.warn(`The email ${emailId} was not sent: ${mailFailure(error)}`)
      return 'failed'
    }
    await this.context.withTenant(tenantId, () => this.emails.sent(emailId, new Date(), said))
    return 'sent'
  }

  /**
   * The email as it is sent: to whom, in what language, saying what. It is written from the
   * order as it stands now, so one that hands the order over, with its QR code and a link, goes
   * only to the address the order has: queued for an address the order has left since, it is
   * withdrawn instead. So is one that says the order is paid, with its QR code, once the order
   * no longer is. What it hands the order over with is added to `handedOver`.
   */
  private async compose(
    email: ClaimedEmail,
    now: Date,
    handedOver: string[],
  ): Promise<Composed | typeof WITHDRAWN> {
    const order = await this.emails.order(email.orderId)
    if (!order) throw new Error('The order of the email is not there')
    const left = HANDING_OVER_EMAIL_KINDS.includes(email.kind) && email.recipient !== order.email
    const noLongerPaid = OF_A_PAID_ORDER.includes(email.kind) && order.status !== 'paid'
    if (left || noLongerPaid) {
      await this.emails.withdraw(email.id, now)
      return WITHDRAWN
    }
    const written = await this.written(email, order, now, handedOver)
    if (written === WITHDRAWN) return WITHDRAWN
    const account = await this.emails.account(email.recipient, order.id)
    const locale = recipientLocale({ account: account?.locale, tenant: order.conventionLocale })
    // The way to sign in is told only where signing in shows the order: on the account it is on.
    const signInLink = account?.holdsOrder ? `${this.portalUrl}/login` : null
    // Whether an address has an account is told to nobody. What is kept of the email is so
    // written as for an address with none: in the convention's language, with no way to sign in.
    const keptLocale = recipientLocale({ tenant: order.conventionLocale })
    return {
      to: email.recipient,
      locale,
      content: written.write({ locale, signInLink }),
      kept: {
        locale: keptLocale,
        content: written.write({ locale: keptLocale, signInLink: null }),
      },
      pictures: written.pictures,
    }
  }

  /**
   * What an email says, from the order as it stands now: read once, and written for each reader
   * in the language of their own.
   */
  private async written(
    email: ClaimedEmail,
    order: OrderOfEmail,
    now: Date,
    handedOver: string[],
  ): Promise<Written | typeof WITHDRAWN> {
    const of = { conventionName: order.conventionName, number: order.number }
    const seller = await this.offers.seller(order.tenantId)
    const contactEmail = seller?.contactEmail ?? null
    const payment = await this.emails.lastPayment(order.id)
    /** Where the money of the last payment is, as its provider's module words it. */
    const moneyWith = (locale: Locale) => {
      const sentence =
        payment?.moneyWith && this.providers.moneyWith(payment.provider, payment.moneyWith)
      if (!sentence) return null
      return sentence[locale] ?? sentence.en ?? Object.values(sentence)[0] ?? null
    }

    switch (email.kind) {
      case 'order-confirmation': {
        const { qrCode, orderLink, pictures } = await this.codeAndLink(order, now, handedOver)
        const lines = await this.emails.lines(order.id)
        const documents = await this.emails.documents(order.id)
        const guardianConsent =
          order.ageBand === 'teen'
            ? { formUrl: await this.emails.guardianFormUrl(order.editionId) }
            : null
        const picksUp = lines.some((line) => line.kind === 'merchandise')
        const { pickupInformation } = await this.emails.reminderOf(order.editionId)
        return {
          pictures,
          write: ({ locale, signInLink }) =>
            orderConfirmationEmail({
              ...of,
              locale,
              currency: order.currency,
              totalMinor: order.totalMinor,
              // What a discount code took off is a row of its own, not something sold.
              lines: lines.filter((line) => line.kind !== 'discount'),
              discountMinor: lines.find((line) => line.kind === 'discount')?.amountMinor ?? null,
              picksUp,
              pickupInformation,
              qrCode,
              qrCodeCid: QR_CODE_CID,
              orderLink,
              signInLink,
              seller,
              documents: documents.map((document) => ({
                title: document.title,
                url: `${this.apiUrl}/public/tenants/${order.conventionSlug}/document-versions/${document.versionId}`,
              })),
              guardianConsent,
            }),
        }
      }
      case 'order-expired':
        return {
          write: () =>
            orderExpiredEmail({
              ...of,
              shopLink: `${this.portalUrl}/conventions/${order.conventionSlug}/${order.editionSlug}/shop`,
            }),
        }
      case 'payment-under-review':
        return {
          write: ({ locale }) =>
            paymentUnderReviewEmail({ ...of, moneyWith: moneyWith(locale), contactEmail }),
        }
      case 'needs-review':
        return {
          write: ({ locale }) =>
            needsReviewEmail({
              ...of,
              locale,
              currency: order.currency,
              // The amount matched, so the order had expired and what it held was gone.
              cause: payment?.paidAmountMinor === order.totalMinor ? 'gone' : 'amount',
              paidMinor: payment?.paidAmountMinor ?? 0,
              totalMinor: order.totalMinor,
            }),
        }
      case 'payment-not-needed':
        return {
          write: ({ locale }) =>
            paymentNotNeededEmail({ ...of, moneyWith: moneyWith(locale), contactEmail }),
        }
      case 'payment-not-needed-orgs':
        return {
          write: ({ locale }) =>
            paymentNotNeededOrgsEmail({
              ...of,
              locale,
              currency: order.currency,
              paidMinor: payment?.paidAmountMinor ?? 0,
              providerReference: payment?.providerReference ?? null,
            }),
        }
      // What an org's work on the order tells its buyer, written from the order as it stands
      // when the email is sent (docs/specs/0006-order-management.md, Emails).
      case 'order-holder-changed':
        return {
          write: () =>
            orderHolderChangedEmail({ ...of, holderName: order.holderName, contactEmail }),
        }
      case 'order-variant-changed': {
        const lines = await this.emails.lines(order.id)
        return {
          write: () =>
            orderVariantChangedEmail({
              ...of,
              merchandise: lines.filter((line) => line.kind === 'merchandise'),
              contactEmail,
            }),
        }
      }
      case 'order-email-changed': {
        const { qrCode, orderLink, pictures } = await this.codeAndLink(order, now, handedOver)
        return {
          pictures,
          write: () =>
            orderEmailChangedEmail({
              ...of,
              qrCode,
              qrCodeCid: QR_CODE_CID,
              orderLink,
              contactEmail,
            }),
        }
      }
      case 'order-email-replaced':
        return { write: () => orderEmailReplacedEmail({ ...of, contactEmail }) }
      case 'order-declined':
        return {
          write: ({ locale }) =>
            orderDeclinedEmail({ ...of, moneyWith: moneyWith(locale), contactEmail }),
        }
      case 'order-canceled':
        return { write: () => orderCanceledEmail({ ...of, contactEmail }) }
      // The reminder before the edition (docs/specs/0011-pre-edition-reminder.md, R4): the QR
      // code the order carries now, with what the edition says of its hours and its pick-up.
      case 'pre-edition-reminder': {
        const sharing = await this.emails.codeOrders(order)
        // Queued for a paid order: one canceled since has no code to show at the gate. The
        // reminder of its code goes to the earliest order on it still paid, if one is (R3), and
        // paid before the reminder went out: one paid after gets none (R6).
        if (order.status !== 'paid') {
          await this.emails.withdraw(email.id, now)
          const next = sharing.find(
            (other) =>
              other.status === 'paid' &&
              other.email !== null &&
              other.paidAt !== null &&
              other.paidAt.getTime() <= email.queuedAt.getTime(),
          )
          if (next?.email) await this.emails.queue(next, 'pre-edition-reminder', next.email)
          return WITHDRAWN
        }
        const { qrCode, pictures } = await this.code(order, handedOver)
        const told = await this.emails.reminderOf(order.editionId)
        // A "Buy more" order holds no ticket: the guardian rules are those of the code's ticket.
        const ageBand = sharing.find((other) => other.holdsTicket)?.ageBand ?? order.ageBand
        const guardian = ageBand === 'child' || ageBand === 'teen' ? ageBand : null
        return {
          pictures,
          write: () =>
            preEditionReminderEmail({
              ...of,
              editionName: order.editionName,
              qrCode,
              qrCodeCid: QR_CODE_CID,
              openingHours: told.openingHours,
              pickupInformation: told.pickupInformation,
              guardian,
              guardianFormUrl: guardian === 'teen' ? told.guardianFormUrl : null,
              contactEmail,
            }),
        }
      }
      // A fresh link for one that expired (docs/specs/0009-buyer-self-service.md, K4): the link
      // alone, since the order's page shows the rest.
      case 'order-link': {
        const orderLink = await this.link(order, now, handedOver)
        return { write: () => orderLinkEmail({ ...of, orderLink, contactEmail }) }
      }
    }
  }

  /**
   * An order link of its own for an email, of which only the hash is kept. Its token comes after
   * the `#` of the portal's address, which no browser sends to a server.
   */
  private async link(
    order: { id: string; tenantId: string; editionId: string; editionEndsAt: Date },
    now: Date,
    handedOver: string[],
  ): Promise<string> {
    const token = secretToken()
    handedOver.push(token)
    const from = Math.max(order.editionEndsAt.getTime(), now.getTime())
    await this.emails.addLink(order, hashOf(token), new Date(from + ORDER_LINK_DAYS * DAY))
    return `${this.portalUrl}/order#${token}`
  }

  /**
   * What an email that hands an order over carries: the QR code the order carries now, opened,
   * with its picture, and an order link of its own, of which only the hash is kept.
   */
  private async codeAndLink(
    order: {
      id: string
      tenantId: string
      editionId: string
      number: string
      editionEndsAt: Date
    },
    now: Date,
    handedOver: string[],
  ) {
    return {
      ...(await this.code(order, handedOver)),
      orderLink: await this.link(order, now, handedOver),
    }
  }

  /** The QR code the order carries now, opened, with its picture. */
  private async code(
    order: { id: string; tenantId: string; number: string },
    handedOver: string[],
  ) {
    const sealed = await this.emails.qrCode(order.id)
    if (!sealed) throw new Error('A paid order has a QR code')
    const qrCode = open(this.key, sealed.code, orderQrCodeOf(order.tenantId, sealed.id))
    handedOver.push(qrCode)
    return {
      qrCode,
      pictures: [
        {
          cid: QR_CODE_CID,
          filename: `${order.number}.png`,
          content: await toBuffer(qrCode, {
            type: 'png',
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 480,
          }),
        },
      ],
    }
  }
}
