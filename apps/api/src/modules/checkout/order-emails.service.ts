import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { open, orderQrCodeOf, sealingKey } from '@opos/db/sealed'
import { type Locale } from '@opos/i18n'
import {
  needsReviewEmail,
  orderConfirmationEmail,
  type OrderEmailContent,
  orderExpiredEmail,
  paymentNotNeededEmail,
  paymentNotNeededOrgsEmail,
  paymentUnderReviewEmail,
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
import { OfferRepository } from './offer.repository'
import { type ClaimedEmail, OrderEmailsRepository } from './order-emails.repository'

/** How often the outbox looks for emails that are due. */
const OUTBOX_EVERY_MS = 15_000

/** How long a claimed email is this process's alone: longer than a send may take. */
const LEASE_MS = 5 * 60_000

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** An order link is valid until this long after its edition ends (buyer self-service, K3). */
export const ORDER_LINK_DAYS = 30

/** The content id the picture of a QR code travels under. */
const QR_CODE_CID = 'qr-code@opos'

/**
 * How long a failed send waits for its next try, by how many tries have failed: a minute, then
 * twice as long each time, up to six hours.
 */
export const retryDelayMs = (failedAttempts: number) =>
  Math.min(2 ** Math.max(failedAttempts - 1, 0), 360) * MINUTE

interface Composed {
  to: string
  locale: Locale
  content: OrderEmailContent
  pictures?: { cid: string; filename: string; content: Buffer }[]
}

/**
 * The outbox of the orders' emails (docs/specs/0004-checkout-and-orders.md, Emails, Jobs). An
 * email is queued in the transaction of its cause; this job sends what is due, in its recipient's
 * language or the convention's for an address with no account, marks it sent, and tries a failed
 * send again after a growing delay, so no email is lost to one. Sending is outbound I/O and runs
 * outside every transaction: an email is claimed first, for this process alone, under a lock
 * another process skips.
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
    const claimed = await this.context.withTenant(tenantId, async () => {
      const email = await this.emails.claim(emailId, now, new Date(now.getTime() + LEASE_MS))
      if (!email) return undefined
      // An email that cannot be written is tried again later, as one that could not be sent.
      const composed = await this.compose(email).catch((error: unknown) => {
        this.logger.error(`The email ${emailId} could not be written: ${String(error)}`)
        return undefined
      })
      return { email, composed }
    })
    // Sent, or taken by another process, since it was found.
    if (!claimed) return undefined
    const { email, composed } = claimed
    try {
      if (!composed) throw new Error('The email could not be written')
      await this.mail.sendOrderEmail(composed)
    } catch (error) {
      const next = new Date(Date.now() + retryDelayMs(email.failedAttempts + 1))
      await this.context.withTenant(tenantId, () => this.emails.failed(emailId, next))
      this.logger.warn(`The email ${emailId} was not sent: ${mailFailure(error)}`)
      return 'failed'
    }
    await this.context.withTenant(tenantId, () => this.emails.sent(emailId, new Date()))
    return 'sent'
  }

  /** The email as it is sent: to whom, in what language, saying what. */
  private async compose(email: ClaimedEmail): Promise<Composed> {
    const order = await this.emails.order(email.orderId)
    if (!order) throw new Error('The order of the email is not there')
    const account = await this.emails.account(email.recipient)
    const locale = recipientLocale({ account: account?.locale, tenant: order.conventionLocale })
    const of = { conventionName: order.conventionName, number: order.number }
    const seller = await this.offers.seller(order.tenantId)
    const contactEmail = seller?.contactEmail ?? ''
    const payment = await this.emails.lastPayment(order.id)
    /** Where the money of the last payment is, as its provider's module words it. */
    const moneyWith = () => {
      const sentence =
        payment?.moneyWith && this.providers.moneyWith(payment.provider, payment.moneyWith)
      if (!sentence) return null
      return sentence[locale] ?? sentence.en ?? Object.values(sentence)[0] ?? null
    }
    const to = email.recipient

    switch (email.kind) {
      case 'order-confirmation': {
        const sealed = await this.emails.qrCode(order.id)
        if (!sealed) throw new Error('A paid order has a QR code')
        const qrCode = open(this.key, sealed.code, orderQrCodeOf(order.tenantId, sealed.id))
        // A link of its own for each email sent: only its hash is kept.
        const token = secretToken()
        await this.emails.addLink(
          order,
          hashOf(token),
          new Date(order.editionEndsAt.getTime() + ORDER_LINK_DAYS * DAY),
        )
        const lines = await this.emails.lines(order.id)
        const documents = await this.emails.documents(order.id)
        return {
          to,
          locale,
          content: orderConfirmationEmail({
            ...of,
            locale,
            currency: order.currency,
            totalMinor: order.totalMinor,
            lines,
            picksUp: lines.some((line) => line.kind === 'merchandise'),
            qrCode,
            qrCodeCid: QR_CODE_CID,
            orderLink: `${this.portalUrl}/orders/${token}`,
            signInLink: account ? `${this.portalUrl}/login` : null,
            seller: seller ?? { name: '', address: '', registrationNumber: '', contactEmail: '' },
            documents: documents.map((document) => ({
              title: document.title,
              url: `${this.apiUrl}/public/tenants/${order.conventionSlug}/document-versions/${document.versionId}`,
            })),
            guardianConsent:
              order.ageBand === 'teen'
                ? { formUrl: await this.emails.guardianFormUrl(order.editionId) }
                : null,
          }),
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
      case 'order-expired':
        return {
          to,
          locale,
          content: orderExpiredEmail({
            ...of,
            shopLink: `${this.portalUrl}/conventions/${order.conventionSlug}/${order.editionSlug}/shop`,
          }),
        }
      case 'payment-under-review':
        return {
          to,
          locale,
          content: paymentUnderReviewEmail({ ...of, moneyWith: moneyWith(), contactEmail }),
        }
      case 'needs-review':
        return {
          to,
          locale,
          content: needsReviewEmail({
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
          to,
          locale,
          content: paymentNotNeededEmail({ ...of, moneyWith: moneyWith(), contactEmail }),
        }
      case 'payment-not-needed-orgs':
        return {
          to,
          locale,
          content: paymentNotNeededOrgsEmail({
            ...of,
            locale,
            currency: order.currency,
            paidMinor: payment?.paidAmountMinor ?? 0,
            providerReference: payment?.providerReference ?? null,
          }),
        }
    }
  }
}
