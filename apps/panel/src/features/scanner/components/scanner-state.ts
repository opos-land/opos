import { useLingui } from '@lingui/react/macro'
import { type Scanner } from '@opos/contract'

/**
 * How a scanner stands, in a word the list and its own page share: revoked, ended, paired with a
 * phone or still waiting for one. Whether it has ended is judged at `at`, the moment it was read.
 */
export function useScannerState() {
  const { t } = useLingui()
  return (scanner: Scanner, at: number) =>
    scanner.revokedAt
      ? t`Revoked`
      : Date.parse(scanner.expiresAt) <= at
        ? t`Ended`
        : scanner.paired
          ? t`Paired with a phone`
          : t`Waiting for a phone`
}

/** Whether the scanner stands at `at`: neither revoked nor ended. */
export const stands = (scanner: Scanner, at: number) =>
  !scanner.revokedAt && Date.parse(scanner.expiresAt) > at
