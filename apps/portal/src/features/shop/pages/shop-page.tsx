import { Trans, useLingui } from '@lingui/react/macro'
import { type Offer } from '@opos/contract'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { env } from '../../../shared/config/env'
import { isNotFound } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Alert,
  AlertDescription,
  buttonVariants,
  ErrorMessage,
  linkClass,
  LoadingView,
  NotFoundView,
  Page,
  Section,
} from '../../../shared/ui'
import { offerOptions } from '../api/shop'
import { useMoney, useSentence } from '../hooks/use-money'
import { documentVersionUrl } from '../model/files'

type TicketType = Offer['ticketTypes'][number]

/** How a payment method a provider's module lists is named; one the shop does not know, as it is. */
function useMethodName() {
  const { t } = useLingui()
  return (method: string) =>
    ({ blik: 'BLIK', transfer: t`bank transfer`, card: t`payment card` })[method] ?? method
}

/** Why a ticket type cannot be chosen now, or nothing while it is on sale. */
function StateOf({ state }: { state: TicketType['state'] }) {
  if (state === 'not-yet') return <Trans>Not yet on sale</Trans>
  if (state === 'closed') return <Trans>Sales closed</Trans>
  if (state === 'sold-out') return <Trans>Sold out</Trans>
  return null
}

/**
 * The shop of a published edition (docs/specs/0004-checkout-and-orders.md, S1-S6): what it sells
 * now, each price gross and with its currency, or the org's "sales closed" message instead of
 * products. It never shows how much is left.
 */
export function ShopPage() {
  const { t } = useLingui()
  const { tenantSlug = '', editionSlug = '' } = useParams()
  const offer = useQuery(offerOptions(tenantSlug, editionSlug))
  usePageTitle(t`Shop`)
  const money = useMoney(offer.data?.currency ?? 'PLN')
  const methodName = useMethodName()
  const sentence = useSentence()
  const base = `/conventions/${tenantSlug}/${editionSlug}`

  if (offer.isError) {
    return isNotFound(offer.error) ? <NotFoundView /> : <ErrorMessage error={offer.error} />
  }
  if (offer.isPending) return <LoadingView />
  const { data } = offer
  const selling = data.open && data.onSale
  const methods = data.provider?.methods.map(methodName).join(', ') ?? ''
  const checkout = (ticketType: string) => `${base}/shop/checkout?ticketType=${ticketType}`

  return (
    <Page title={<Trans>Shop</Trans>}>
      <p>
        <Link to={base} className={linkClass}>
          <Trans>Back to the edition</Trans>
        </Link>
      </p>
      {!selling && (
        <Alert>
          <AlertDescription>
            {data.salesClosedMessage ?? <Trans>Sales are closed for now.</Trans>}
          </AlertDescription>
        </Alert>
      )}
      {selling && (
        <ul className="flex flex-col gap-4">
          {data.ticketTypes.map((type) => (
            <li key={type.id}>
              <Section title={type.name}>
                {type.shortDescription && <p>{type.shortDescription}</p>}
                {type.priceMinor !== null && (
                  <p className="text-lg font-semibold">{money(type.priceMinor)}</p>
                )}
                {type.state === 'on-sale' ? (
                  <Link
                    to={checkout(type.id)}
                    className={buttonVariants()}
                    aria-label={t`Choose ${type.name}`}
                  >
                    <Trans>Choose</Trans>
                  </Link>
                ) : (
                  <p className="text-muted-foreground font-medium">
                    <StateOf state={type.state} />
                  </p>
                )}
              </Section>
            </li>
          ))}
          {data.merchOnly && data.items.length > 0 && (
            <li>
              <Section title={<Trans>Merch only</Trans>}>
                <p>
                  <Trans>
                    Order merchandise without a ticket and pick it up at the convention.
                  </Trans>
                </p>
                <Link to={checkout('none')} className={buttonVariants({ variant: 'outline' })}>
                  <Trans>Order merchandise</Trans>
                </Link>
              </Section>
            </li>
          )}
        </ul>
      )}
      {selling && (
        <p className="text-muted-foreground text-sm">
          <Trans>Every price is a gross amount.</Trans>
        </p>
      )}
      <footer className="flex flex-col gap-4 border-t pt-4 text-sm">
        {data.provider && data.provider.methods.length > 0 && (
          <p>
            <Trans>Payment methods: {methods}</Trans>
          </p>
        )}
        {data.provider?.consent && data.provider.consent.links.length > 0 && (
          <ul className="flex flex-col gap-1">
            {data.provider.consent.links.map((link) => (
              <li key={link.url}>
                <a href={link.url} className={linkClass} target="_blank" rel="noreferrer">
                  {sentence(link.label)}
                </a>
              </li>
            ))}
          </ul>
        )}
        {(data.documents.length > 0 || data.faqUrl) && (
          <ul className="flex flex-col gap-1">
            {data.documents.map((document) => (
              <li key={document.versionId}>
                <a
                  href={documentVersionUrl(env.VITE_API_URL, tenantSlug, document.versionId)}
                  className={linkClass}
                  target="_blank"
                  rel="noreferrer"
                >
                  {document.title}
                </a>
              </li>
            ))}
            {data.faqUrl && (
              <li>
                <a href={data.faqUrl} className={linkClass} target="_blank" rel="noreferrer">
                  <Trans>Frequently asked questions</Trans>
                </a>
              </li>
            )}
          </ul>
        )}
        {data.seller && (
          <address className="flex flex-col not-italic">
            <span className="font-medium">
              <Trans>Seller</Trans>
            </span>
            <span>{data.seller.name}</span>
            <span>{data.seller.address}</span>
            <span>{data.seller.registrationNumber}</span>
            <a href={`mailto:${data.seller.contactEmail}`} className={linkClass}>
              {data.seller.contactEmail}
            </a>
          </address>
        )}
      </footer>
    </Page>
  )
}
