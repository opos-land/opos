import { Plural, Trans } from '@lingui/react/macro'
import { type Offer } from '@opos/contract'
import { CheckboxField } from '../../../shared/ui'
import { useMoney } from '../hooks/use-money'
import { type Draft, offeredAddOns } from '../model/checkout'

/**
 * The add-ons step (docs/specs/0004-checkout-and-orders.md, C10): each add-on offered with the
 * ticket type and its price. A headcount-only one says no place is reserved; a limited one cannot
 * be ticked once no place is left, and shows how many are left only below its threshold. In "Buy
 * more" an add-on bought already is marked and cannot be taken again
 * (docs/specs/0009-buyer-self-service.md, B3).
 */
export function AddOnsStep({
  offer,
  draft,
  ranOut,
  change,
}: {
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
        <li key={addOn.id} className="flex flex-col gap-1">
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
