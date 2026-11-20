import { Plural, Trans } from '@lingui/react/macro'
import { type Offer } from '@opos/contract'
import { env } from '../../../shared/config/env'
import { CheckboxField } from '../../../shared/ui'
import { useMoney } from '../hooks/use-money'
import { type Draft, offeredAddOns } from '../model/checkout'
import { addOnFileUrl } from '../model/files'

/**
 * The add-ons step (docs/specs/0004-checkout-and-orders.md, C10): each add-on offered with the
 * ticket type and its price, with its picture when it has one (docs/specs/0003-catalog.md, A4). A headcount-only one says no place is reserved; a limited one cannot
 * be ticked once no place is left, and shows how many are left only below its threshold. In "Buy
 * more" an add-on bought already is marked and cannot be taken again
 * (docs/specs/0009-buyer-self-service.md, B3).
 */
export function AddOnsStep({
  tenantSlug,
  offer,
  draft,
  ranOut,
  change,
}: {
  /** The convention of the shop: the address of a picture names it. */
  tenantSlug: string
  offer: Offer
  draft: Draft
  /** The add-on that ran out since it was chosen, marked for the buyer. */
  ranOut: string | null
  change: (changes: Partial<Draft>) => void
}) {
  const money = useMoney(offer.currency)
  const toggle = (id: string, ticked: boolean) =>
    change({
      addOnIds: ticked ? [...draft.addOnIds, id] : draft.addOnIds.filter((own) => own !== id),
    })

  const ordered = new Set(draft.extending?.addOnIds)

  return (
    <ul className="flex flex-col gap-4">
      {offeredAddOns(offer, draft).map((addOn) => (
        <li key={addOn.id} className="flex flex-col gap-2">
          {addOn.picture && (
            <img
              src={addOnFileUrl(env.VITE_API_URL, tenantSlug, addOn.picture.fileId, 'small')}
              alt={addOn.name}
              width={Math.round((addOn.picture.width / addOn.picture.height) * 120)}
              height={120}
              loading="lazy"
              className="h-30 w-auto self-start rounded-lg"
            />
          )}
          <CheckboxField
            label={
              <>
                {addOn.name}: {money(addOn.amountMinor)}
              </>
            }
            hint={
              <>
                {addOn.description}{' '}
                {ordered.has(addOn.id) && (
                  <strong>
                    <Trans>Already ordered.</Trans>{' '}
                  </strong>
                )}
                {addOn.kind === 'headcount' && (
                  <Trans>
                    This only tells the convention how many to expect: no place is reserved.
                  </Trans>
                )}
                {addOn.soldOut && <Trans>No place is left.</Trans>}
                {!addOn.soldOut && addOn.placesLeft !== null && (
                  <Plural value={addOn.placesLeft} one="# place left." other="# places left." />
                )}
                {ranOut === addOn.id && (
                  <strong className="text-destructive">
                    {' '}
                    <Trans>It ran out while you were ordering.</Trans>
                  </strong>
                )}
              </>
            }
            checked={draft.addOnIds.includes(addOn.id)}
            disabled={
              ordered.has(addOn.id) || (addOn.soldOut && !draft.addOnIds.includes(addOn.id))
            }
            onChange={(ticked) => toggle(addOn.id, ticked)}
          />
        </li>
      ))}
    </ul>
  )
}
