import { Trans, useLingui } from '@lingui/react/macro'
import { toDataURL } from 'qrcode'
import { useEffect, useState } from 'react'

/**
 * The QR code of a paid order, drawn in the browser from its text: the picture a scanner reads,
 * and under it the code itself, which a desk types by hand when no camera reads it.
 */
export function OrderQrCode({ number, code }: { number: string; code: string }) {
  const { t } = useLingui()
  const [picture, setPicture] = useState<string>()
  useEffect(() => {
    let shown = true
    void toDataURL(code, { errorCorrectionLevel: 'M', margin: 2, width: 480 }).then((url) => {
      if (shown) setPicture(url)
    })
    return () => {
      shown = false
    }
  }, [code])

  return (
    <div className="flex flex-col items-start gap-3">
      {picture && (
        <img
          src={picture}
          alt={t`QR code of the order ${number}`}
          width={240}
          height={240}
          // A QR code is black on white whatever the theme: a scanner reads nothing else.
          className="rounded-md bg-white"
        />
      )}
      <p className="font-mono text-sm break-all">{code}</p>
      <p className="text-muted-foreground text-sm">
        <Trans>
          Show this code at the entrance and when you pick up your merchandise. Whoever holds it can
          use it, so keep it to yourself.
        </Trans>
      </p>
    </div>
  )
}
