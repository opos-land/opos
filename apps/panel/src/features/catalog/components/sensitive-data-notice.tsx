import { Trans } from '@lingui/react/macro'
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui'

/** What a custom field must never ask for, said wherever a field is defined or changed. */
export function SensitiveDataNotice() {
  return (
    <Alert>
      <AlertTitle>
        <Trans>Ask for nothing sensitive</Trans>
      </AlertTitle>
      <AlertDescription>
        <Trans>
          A custom field must not ask about health, beliefs, an identity document number or anything
          else a convention does not need to let a person in.
        </Trans>
      </AlertDescription>
    </Alert>
  )
}
