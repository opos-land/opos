import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { type StepId } from '../model/checkout'

/** The name of a step; the first one is the ticket holder's, or the buyer's of merchandise alone. */
export const stepName = (step: StepId, merchOnly: boolean): MessageDescriptor =>
  ({
    holder: merchOnly ? msg`Buyer` : msg`Ticket holder`,
    'add-ons': msg`Add-ons`,
    merch: msg`Merch`,
    summary: msg`Summary`,
  })[step]

/** The steps of the checkout, in order, with the current one marked. */
export function StepsNav({
  steps,
  current,
  merchOnly,
}: {
  steps: readonly StepId[]
  current: StepId
  merchOnly: boolean
}) {
  const { t, i18n } = useLingui()
  return (
    <nav aria-label={t`Steps of the order`}>
      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={step === current ? 'step' : undefined}
            className={step === current ? 'font-semibold' : 'text-muted-foreground'}
          >
            {index + 1}. {i18n._(stepName(step, merchOnly))}
          </li>
        ))}
      </ol>
    </nav>
  )
}
