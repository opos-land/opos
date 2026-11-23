import { Trans, useLingui } from '@lingui/react/macro'
import { type Offer } from '@opos/contract'
import { useState } from 'react'
import { env } from '../../../shared/config/env'
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  FormField,
  linkClass,
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
  Notice,
} from '../../../shared/ui'
import { useMoney } from '../hooks/use-money'
import { type Draft, offeredItems, ticketTypeOf } from '../model/checkout'
import { merchandiseFileUrl } from '../model/files'

type Item = Offer['items'][number]
type Variant = Item['variants'][number]

/** The labels of a variant's values, in the order of its item's axes. */
const labelsOf = (item: Item, variant: Variant) =>
  item.axes.flatMap(
    (axis) => axis.values.find((value) => variant.valueIds.includes(value.id))?.label ?? [],
  )

/**
 * One item of the merch step: its name, price, description and pictures, a picker of the
 * variants that exist grouped by the first axis, and a quantity up to the item's limit an order
 * and what is left. Each variant chosen is a line of its own.
 */
function ItemCard({
  item,
  tenantSlug,
  lines,
  ranOut,
  ordered,
  money,
  setLines,
}: {
  item: Item
  tenantSlug: string
  /** The lines of the whole order. */
  lines: Draft['items']
  ranOut: string | null
  /** Whether the order "Buy more" adds to holds the item already: it may be ordered again. */
  ordered: boolean
  money: (amountMinor: number) => string
  setLines: (lines: Draft['items']) => void
}) {
  const { t } = useLingui()
  const single = item.axes.length === 0 ? item.variants[0] : undefined
  const [chosen, setChosen] = useState(single?.id ?? '')
  const [quantity, setQuantity] = useState(1)
  const [missing, setMissing] = useState(false)
  const own = new Set(item.variants.map((variant) => variant.id))
  const taken = lines.filter((line) => own.has(line.variantId))
  const soldOut = item.variants.every((variant) => variant.maxQuantity === 0)
  const variant = item.variants.find((held) => held.id === chosen)
  // What the item's limit an order still allows, beside its other variants already chosen.
  const others = taken
    .filter((line) => line.variantId !== chosen)
    .reduce((sum, line) => sum + line.quantity, 0)
  const most = Math.max(0, Math.min(variant?.maxQuantity ?? 0, item.perOrderLimit - others))
  const charts = item.axes.flatMap((axis) =>
    axis.values.flatMap((value) => (value.sizeChart ? [{ ...value, chart: value.sizeChart }] : [])),
  )
  const [first, ...rest] = item.axes
  const optionLabel = (held: Variant) => {
    const label = labelsOf(item, held)
      .slice(first && rest.length > 0 ? 1 : 0)
      .join(', ')
    return held.maxQuantity === 0 ? t`${label} (unavailable)` : label
  }

  const add = () => {
    if (!variant) return setMissing(true)
    setMissing(false)
    setLines([
      ...lines.filter((line) => line.variantId !== variant.id),
      { variantId: variant.id, quantity: Math.min(quantity, most) },
    ])
  }

  return (
    <li className="flex flex-col gap-3 border-b pb-4 last:border-b-0">
      <h3 className="text-lg font-semibold">{item.name}</h3>
      <p className="font-medium">{money(item.amountMinor)}</p>
      {ordered && (
        <p className="text-sm font-medium">
          <Trans>Already ordered. You can order it again.</Trans>
        </p>
      )}
      {item.description && <p>{item.description}</p>}
      {item.pictures.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {item.pictures.map((picture) => (
            <li key={picture.fileId}>
              <img
                src={merchandiseFileUrl(env.VITE_API_URL, tenantSlug, picture.fileId, 'small')}
                alt={item.name}
                width={Math.round((picture.width / picture.height) * 160)}
                height={160}
                loading="lazy"
                className="h-40 w-auto rounded-lg"
              />
            </li>
          ))}
        </ul>
      )}
      {item.pictures.length > 0 && item.picturesIllustrative && (
        <p className="text-muted-foreground text-sm">
          <Trans>The pictures are illustrative: the item may differ in details.</Trans>
        </p>
      )}
      {charts.map((value) => (
        <Dialog key={value.id}>
          <DialogTrigger className={`${linkClass} self-start text-sm`}>
            {charts.length > 1 ? t`Size chart: ${value.label}` : t`Size chart`}
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogTitle>{t`Size chart: ${value.label}`}</DialogTitle>
            <img
              src={merchandiseFileUrl(env.VITE_API_URL, tenantSlug, value.chart.fileId, 'large')}
              alt={t`The size chart of ${item.name}, ${value.label}`}
              width={value.chart.width}
              height={value.chart.height}
              className="h-auto w-full"
            />
          </DialogContent>
        </Dialog>
      ))}

      {soldOut ? (
        <p className="text-muted-foreground font-medium">
          <Trans>Sold out</Trans>
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {!single && (
            <FormField
              label={t`Variant of ${item.name}`}
              error={missing ? t`Choose a variant first.` : undefined}
            >
              {(control) => (
                <NativeSelect
                  {...control}
                  value={chosen}
                  onChange={(event) => {
                    setChosen(event.target.value)
                    setQuantity(1)
                    setMissing(false)
                  }}
                >
                  <NativeSelectOption value="">{t`Choose`}</NativeSelectOption>
                  {first && rest.length > 0
                    ? first.values.map((value) => {
                        const group = item.variants.filter((held) =>
                          held.valueIds.includes(value.id),
                        )
                        if (group.length === 0) return null
                        return (
                          <NativeSelectOptGroup key={value.id} label={value.label}>
                            {group.map((held) => (
                              <NativeSelectOption
                                key={held.id}
                                value={held.id}
                                disabled={held.maxQuantity === 0}
                              >
                                {optionLabel(held)}
                              </NativeSelectOption>
                            ))}
                          </NativeSelectOptGroup>
                        )
                      })
                    : item.variants.map((held) => (
                        <NativeSelectOption
                          key={held.id}
                          value={held.id}
                          disabled={held.maxQuantity === 0}
                        >
                          {optionLabel(held)}
                        </NativeSelectOption>
                      ))}
                </NativeSelect>
              )}
            </FormField>
          )}
          <FormField label={t`Quantity of ${item.name}`}>
            {(control) => (
              <NativeSelect
                {...control}
                value={Math.min(quantity, Math.max(most, 1))}
                disabled={most === 0}
                onChange={(event) => setQuantity(Number(event.target.value))}
              >
                {Array.from({ length: Math.max(most, 1) }, (_, index) => index + 1).map((n) => (
                  <NativeSelectOption key={n} value={n}>
                    {n}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={add}
              disabled={!!variant && most === 0}
            >
              <Trans>Add to the order</Trans>
            </Button>
          </div>
        </div>
      )}

      {taken.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t`In your order: ${item.name}`}>
          {taken.map((line) => {
            const held = item.variants.find((other) => other.id === line.variantId)
            const labels = held ? labelsOf(item, held).join(', ') : ''
            const name = labels ? `${item.name} (${labels})` : item.name
            return (
              <li key={line.variantId} className="flex flex-wrap items-center gap-3">
                <span>
                  {line.quantity} × {name}
                </span>
                {ranOut === line.variantId && (
                  <strong className="text-destructive">
                    <Trans>It ran out while you were ordering.</Trans>
                  </strong>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t`Remove ${name}`}
                  onClick={() =>
                    setLines(lines.filter((other) => other.variantId !== line.variantId))
                  }
                >
                  <Trans>Remove</Trans>
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

/**
 * The merch step (docs/specs/0004-checkout-and-orders.md, C11-C13): the pre-order notice while a
 * deadline is set, the perks the ticket includes, and each item offered.
 */
export function MerchStep({
  offer,
  draft,
  tenantSlug,
  ranOut,
  preorderDeadline,
  change,
}: {
  offer: Offer
  draft: Draft
  tenantSlug: string
  /** The variant that ran out since it was chosen, marked for the buyer. */
  ranOut: string | null
  /** The pre-order deadline, written in the convention's time zone; null while none is set. */
  preorderDeadline: string | null
  change: (changes: Partial<Draft>) => void
}) {
  const money = useMoney(offer.currency)
  const type = ticketTypeOf(offer, draft)

  return (
    <div className="flex flex-col gap-4">
      {preorderDeadline && (
        <Notice>
          <Trans>
            Order merchandise by {preorderDeadline} to be sure of getting it. After that it sells
            only while stock lasts.
          </Trans>
        </Notice>
      )}
      {type && type.perks.length > 0 && (
        <div>
          <p className="font-medium">
            <Trans>Your ticket already includes:</Trans>
          </p>
          <ul className="list-disc pl-5">
            {type.perks.map((perk) => (
              <li key={perk}>{perk}</li>
            ))}
          </ul>
        </div>
      )}
      <ul className="flex flex-col gap-4">
        {offeredItems(offer, draft).map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            tenantSlug={tenantSlug}
            lines={draft.items}
            ranOut={ranOut}
            ordered={draft.extending?.itemIds.includes(item.id) ?? false}
            money={money}
            setLines={(items) => change({ items })}
          />
        ))}
      </ul>
    </div>
  )
}
