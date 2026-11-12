import { Trans, useLingui } from '@lingui/react/macro'
import { useId, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Switch,
} from '../../../shared/ui'
import { decideConsent, offeredCategories, useConsentChoice } from '../model/consent'
import { CATEGORY_TEXTS, type ConsentCategory } from '../model/tracker'
import { TRACKERS } from '../trackers'

/** A switch per offered category, off unless the current choice allows it, and the decision. */
function Choices({ onDecided }: { onDecided: () => void }) {
  const { i18n } = useLingui()
  const id = useId()
  const choice = useConsentChoice()
  const categories = offeredCategories()
  const [granted, setGranted] = useState<readonly ConsentCategory[]>(() => choice ?? [])

  const decide = (next: readonly ConsentCategory[]) => {
    decideConsent(next)
    onDecided()
  }
  const toggle = (category: ConsentCategory, on: boolean) =>
    setGranted((current) =>
      on ? [...current, category] : current.filter((other) => other !== category),
    )

  return (
    <>
      <ul className="flex flex-col gap-5">
        {categories.map((category) => {
          const texts = CATEGORY_TEXTS[category]
          return (
            <li key={category} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <Label id={`${id}-${category}`} htmlFor={`${id}-${category}-switch`}>
                  {i18n._(texts.label)}
                </Label>
                <Switch
                  id={`${id}-${category}-switch`}
                  aria-labelledby={`${id}-${category}`}
                  aria-describedby={`${id}-${category}-description`}
                  checked={granted.includes(category)}
                  onCheckedChange={(on) => toggle(category, on)}
                />
              </div>
              <p id={`${id}-${category}-description`} className="text-muted-foreground">
                {i18n._(texts.description)}
              </p>
              <ul className="flex list-disc flex-col gap-2 pl-5">
                {TRACKERS.filter((tracker) => tracker.category === category).map((tracker) => (
                  <li key={tracker.id} className="flex flex-col">
                    <span className="font-medium">{tracker.vendor}</span>
                    <span>{i18n._(tracker.purpose)}</span>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
      <DialogFooter>
        <Button variant="outline" onClick={() => decide([])}>
          <Trans>Refuse all</Trans>
        </Button>
        <Button variant="outline" onClick={() => decide(categories)}>
          <Trans>Allow all</Trans>
        </Button>
        <Button onClick={() => decide(granted)}>
          <Trans>Save my choice</Trans>
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * The privacy settings: every listed tracker by category, and the visitor's choice, changed at
 * any time as easily as it was made (docs/PRODUCT.md 10).
 */
export function ConsentSettings({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>Privacy settings</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Choose which optional tools OPOS may use in this browser. OPOS works the same without
              them.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        {/* Mounted on every opening, so the switches start from the current choice. */}
        {open && <Choices onDecided={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
