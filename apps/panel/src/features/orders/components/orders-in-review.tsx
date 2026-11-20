import { Plural, Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Section } from '../../../shared/ui'
import { atLeast, useCurrentTenant } from '../../tenants'
import { ordersOptions } from '../api/orders'

/**
 * How many orders of an edition need review, shown on the edition until each is settled
 * (docs/specs/0006-order-management.md, F3). Nothing for a member who does not read the
 * edition's tickets, and nothing while no order waits.
 */
export function OrdersInReview({ editionId, to }: { editionId: string; to: string }) {
  const { access, api } = useCurrentTenant()
  const canRead = atLeast(access.edition(editionId).tickets, 'read')
  // The count comes with every page of the list: the smallest page is asked for.
  const orders = useQuery({
    ...ordersOptions(api, editionId, { status: 'needs-review', limit: 1 }),
    enabled: canRead,
  })
  const count = orders.data?.needsReview ?? 0
  if (count === 0) return null

  return (
    <Section title={<Trans>Orders that need review</Trans>}>
      <p className="max-w-2xl text-sm">
        <Plural
          value={count}
          one="# order needs review: its payment arrived and could not confirm it. It waits for an organizer to mark it paid or decline it."
          other="# orders need review: their payments arrived and could not confirm them. They wait for an organizer to mark them paid or decline them."
        />
      </p>
      <p className="text-sm">
        <Link to={to} className="underline">
          <Trans>See the orders</Trans>
        </Link>
      </p>
    </Section>
  )
}
