import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { linkClass } from '../../../shared/ui'
import { TRACKERS } from '../trackers'
import { ConsentSettings } from './consent-settings'

/**
 * Opens the privacy settings from the footer, where a choice is changed or withdrawn at any time.
 * With no tracker listed there is nothing to choose, and it shows nothing.
 */
export function ConsentSettingsLink() {
  const [open, setOpen] = useState(false)

  if (TRACKERS.length === 0) return null

  return (
    <>
      <button type="button" className={linkClass} onClick={() => setOpen(true)}>
        <Trans>Privacy settings</Trans>
      </button>
      <ConsentSettings open={open} onOpenChange={setOpen} />
    </>
  )
}
