import { Trans } from '@lingui/react/macro'
import { Button } from '../../../shared/ui'

/**
 * What an org does with a row of an ordered list of the catalog without opening it: move it up or
 * down, and hide it from the shop or show it again. Hiding asks nothing, since the same button
 * shows the row again.
 */
export function ListActions({
  position,
  last,
  hidden,
  pending,
  onMove,
  onHide,
}: {
  position: number
  /** Whether the row holds the last place of the list. */
  last: boolean
  hidden: boolean
  pending: boolean
  onMove: (position: number) => void
  onHide: (hidden: boolean) => void
}) {
  return (
    <>
      {position > 1 && (
        <Button variant="outline" disabled={pending} onClick={() => onMove(position - 1)}>
          <Trans>Move up</Trans>
        </Button>
      )}
      {!last && (
        <Button variant="outline" disabled={pending} onClick={() => onMove(position + 1)}>
          <Trans>Move down</Trans>
        </Button>
      )}
      <Button variant="outline" disabled={pending} onClick={() => onHide(!hidden)}>
        {hidden ? <Trans>Show in the shop</Trans> : <Trans>Hide from the shop</Trans>}
      </Button>
    </>
  )
}
