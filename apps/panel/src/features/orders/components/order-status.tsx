import { useLingui } from '@lingui/react/macro'
import { type OrderStatus } from '@opos/contract'
import { Badge } from '../../../shared/ui'
import { STATUS_LABELS } from '../model/labels'

/** How loud each status is: the one that waits for an org stands out. */
const VARIANTS = {
  'awaiting-payment': 'outline',
  paid: 'secondary',
  'paid-manual': 'secondary',
  expired: 'outline',
  'needs-review': 'default',
  declined: 'destructive',
  canceled: 'destructive',
} as const

/** The status of an order, named. */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useLingui()
  return <Badge variant={VARIANTS[status]}>{t(STATUS_LABELS[status])}</Badge>
}
