import { Trans, useLingui } from '@lingui/react/macro'
import { type Offer, type PricedLine } from '@opos/contract'
import { useState } from 'react'
import { env } from '../../../shared/config/env'
import {
  Button,
  CheckboxField,
  ErrorMessage,
  FormField,
  Input,
  linkClass,
} from '../../../shared/ui'
import { useMoney, useSentence } from '../hooks/use-money'
import { type Draft, summaryIssues } from '../model/checkout'
import { documentVersionUrl } from '../model/files'

/** The name of a line as the summary and the emails write it. */
export const lineName = (line: PricedLine) => {
  const name = line.variant.length > 0 ? `${line.name} (${line.variant.join(', ')})` : line.name
  return line.quantity > 1 ? `${line.quantity} × ${name}` : name
}

/** What the shop made of the discount code a buyer entered at the Summary. */
export interface DiscountState {
  /** The shop took the code: its line is among the lines, and the total is lowered. */
  applied: boolean
  /** The shop refused it: the one thing a buyer is told of a code that cannot be used. */
  refused: boolean
  pending: boolean
  /** Anything else that went wrong asking, such as too many tries. */
  failure: unknown
}

/**
 * The summary (docs/specs/0004-checkout-and-orders.md, C14, C15, O4): the email the QR code goes
 * to, the lines with their prices and the total due, then the edition's consents with the
 * required ones marked, the provider's own consent as its module words it, and a teen's
 * acknowledgement. What is still missing is marked once the buyer tried to place the order.
 */
export function SummaryStep({
  offer,
  draft,
  tenantSlug,
  lines,
  totalMinor,
  email,
  marked,
  discount,
  change,
}: {
  offer: Offer
  draft: Draft
  tenantSlug: string
  lines: readonly PricedLine[]
  totalMinor: number
  /** The address the QR code goes to: the account's, or the one typed. */
  email: string
  /** Whether the buyer tried to place the order: what is missing shows from then on. */
  marked: boolean
  /** What the shop made of the discount code the draft holds. */
  discount: DiscountState
  change: (changes: Partial<Draft>) => void
}) {
  const { t } = useLingui()
  const money = useMoney(offer.currency)
  const sentence = useSentence()
  const missing = summaryIssues(offer, draft, totalMinor)
  const providerConsent = totalMinor > 0 ? (offer.provider?.consent ?? null) : null
  const required = offer.consents.filter((consent) => consent.isRequired).map(({ id }) => id)
  const mark = (
    <strong className="text-destructive">
      <Trans>Accept this to place the order.</Trans>
    </strong>
  )
  // The field keeps what is typed; the draft holds a code only once the buyer applies it.
  const [code, setCode] = useState(draft.discountCode)
  const appliedCode = draft.discountCode.trim().toUpperCase()
  const tick = (id: string, ticked: boolean) =>
    change({
      consentIds: ticked
        ? [...draft.consentIds.filter((own) => own !== id), id]
        : draft.consentIds.filter((own) => own !== id),
    })

  return (
    <div className="flex flex-col gap-4">
      <p>
        <Trans>
          The QR code of your order will be sent to <strong>{email}</strong>.
        </Trans>
      </p>
      <table className="w-full text-left">
        <caption className="sr-only">
          <Trans>Your order</Trans>
        </caption>
        <tbody>
          {lines.map((line) => (
            <tr key={`${line.kind}:${line.variantId ?? line.addOnId ?? line.ticketTypeId}`}>
              <th scope="row" className="py-1 pr-2 font-normal">
                {line.kind === 'discount' ? (
                  <Trans>Discount code {appliedCode}</Trans>
                ) : (
                  lineName(line)
                )}
              </th>
              <td className="py-1 text-right whitespace-nowrap">{money(line.amountMinor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <th scope="row" className="py-2 pr-2">
              <Trans>Total due</Trans>
            </th>
            <td className="py-2 text-right whitespace-nowrap">{money(totalMinor)}</td>
          </tr>
        </tfoot>
      </table>
      {lines.some((line) => line.kind === 'merchandise') && (
        <p className="text-muted-foreground text-sm">
          <Trans>Merchandise is picked up at the convention. It is not shipped.</Trans>
        </p>
      )}
      {discount.applied ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Trans>Code {appliedCode} is applied.</Trans>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCode('')
              change({ discountCode: '' })
            }}
          >
            <Trans>Remove the code</Trans>
          </Button>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex max-w-md items-end gap-2">
            <div className="flex-1">
              <FormField
                label={<Trans>Discount code</Trans>}
                error={discount.refused && <Trans>This code cannot be used for this order.</Trans>}
              >
                {(control) => (
                  <Input
                    {...control}
                    value={code}
                    maxLength={60}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    onChange={(event) => setCode(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter applies the code: it never places the order.
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      change({ discountCode: code.trim() })
                    }}
                  />
                )}
              </FormField>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={discount.pending || code.trim() === ''}
              onClick={() => change({ discountCode: code.trim() })}
            >
              <Trans>Apply the code</Trans>
            </Button>
          </div>
          <ErrorMessage error={discount.failure} />
        </div>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">
          <Trans>Consents</Trans>
        </legend>
        {required.length > 0 && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                change({
                  consentIds: [...new Set([...draft.consentIds, ...required])],
                  // The provider's own consent only when its module allows it.
                  providerConsent:
                    draft.providerConsent || (providerConsent?.selectAllAllowed ?? false),
                })
              }
            >
              <Trans>Select all required</Trans>
            </Button>
          </div>
        )}
        {offer.consents.map((consent) => (
          <CheckboxField
            key={consent.id}
            label={consent.isRequired ? t`${consent.text} (required)` : consent.text}
            hint={
              <>
                {consent.documentVersionId && (
                  <a
                    href={documentVersionUrl(
                      env.VITE_API_URL,
                      tenantSlug,
                      consent.documentVersionId,
                    )}
                    className={linkClass}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Trans>Read the document</Trans>
                  </a>
                )}{' '}
                {marked && missing.consents.includes(consent.id) && mark}
              </>
            }
            checked={draft.consentIds.includes(consent.id)}
            onChange={(ticked) => tick(consent.id, ticked)}
          />
        ))}
        {providerConsent && (
          <CheckboxField
            label={t`${sentence(providerConsent.text)} (required)`}
            hint={
              <>
                {providerConsent.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    className={`${linkClass} mr-2`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {sentence(link.label)}
                  </a>
                ))}
                {marked && missing.provider && mark}
              </>
            }
            checked={draft.providerConsent}
            onChange={(ticked) => change({ providerConsent: ticked })}
          />
        )}
        {draft.ageBand === 'teen' && (
          <CheckboxField
            label={t`I know that the ticket holder brings the guardian’s consent on paper to the convention. (required)`}
            hint={marked && missing.guardian ? mark : undefined}
            checked={draft.guardianAcknowledged}
            onChange={(ticked) => change({ guardianAcknowledged: ticked })}
          />
        )}
      </fieldset>
    </div>
  )
}
