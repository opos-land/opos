import { Trans } from '@lingui/react/macro'
import { type Edition } from '@opos/contract'
import { Badge } from '../../../shared/ui'

export function EditionStatus({ edition }: { edition: Edition }) {
  return (
    <span className="flex flex-wrap gap-2">
      {edition.isActive && (
        <Badge>
          <Trans>Active</Trans>
        </Badge>
      )}
      <Badge variant="outline">
        {edition.isPublished ? <Trans>Published</Trans> : <Trans>Not published</Trans>}
      </Badge>
    </span>
  )
}
