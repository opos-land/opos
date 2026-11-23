import { Trans, useLingui } from '@lingui/react/macro'
import { type EnabledScanner } from '@opos/contract'
import { toDataURL } from 'qrcode'
import { useEffect, useState } from 'react'
import { Section } from '../../../shared/ui'
import { useTenantTime } from '../../tenants'
import { pairingLink } from '../model/device'

/**
 * The pairing code of a scanner just enabled or just given a new one, shown once: as a QR code to read with the phone and
 * as a link. The code is after the `#` of the link, which no server sees.
 */
export function PairingCode({ scanner }: { scanner: EnabledScanner }) {
  const { t } = useLingui()
  const time = useTenantTime()
  const link = pairingLink(window.location.origin, scanner.pairingCode)
  const [picture, setPicture] = useState<string>()
  useEffect(() => {
    let shown = true
    void toDataURL(link, { margin: 2, width: 320 }).then((url) => {
      if (shown) setPicture(url)
    })
    return () => {
      shown = false
    }
  }, [link])
  const { name } = scanner
  const until = time.format(scanner.pairingExpiresAt)

  return (
    <Section title={<Trans>Pair a phone with {name}</Trans>}>
      <p className="max-w-2xl text-sm">
        <Trans>
          Read this QR code with the phone’s camera, or open the link on the phone. The phone that
          opens it becomes the scanner. The code works once, until {until}, and is shown only now.
        </Trans>
      </p>
      {picture && (
        <img
          src={picture}
          alt={t`The QR code that pairs a phone with ${name}`}
          width={320}
          height={320}
          className="rounded-md border"
        />
      )}
      <p className="font-mono text-sm break-all">{link}</p>
    </Section>
  )
}
