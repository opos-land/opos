import { Trans } from '@lingui/react/macro'
import { type Edition } from '@opos/contract'

export function EditionStatus({ edition }: { edition: Edition }) {
  return (
    <span className="flex flex-wrap gap-2">
      {edition.isActive && (
        <span className="rounded-box border-accent text-accent border px-1.5 text-xs">
          <Trans>Active</Trans>
        </span>
      )}
      <span className="rounded-box border-line text-muted border px-1.5 text-xs">
        {edition.isPublished ? <Trans>Published</Trans> : <Trans>Not published</Trans>}
      </span>
    </span>
  )
}
