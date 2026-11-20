import { Trans } from '@lingui/react/macro'
import { QR_CODE_PATTERN } from '@opos/contract'
import { useEffect, useRef, useState } from 'react'

/** How often a frame of the camera is looked at for a code. */
const EVERY_MS = 200

/**
 * The camera's view, read for an order's QR code: each code seen is told once to `onRead`. The
 * picture never leaves the phone: a frame is drawn to a canvas and decoded there. Where the
 * phone gives no camera, it says so, and the code is typed instead.
 */
export function QrReader({ onRead, paused }: { onRead: (code: string) => void; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const told = useRef<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (paused) return
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let stopped = false
    told.current = null

    const start = async () => {
      // The decoder is loaded only where a camera is opened.
      const [{ default: jsQR }, media] = await Promise.all([
        import('jsqr'),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
      ])
      if (stopped) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream = media
      const view = video.current
      if (!view) return
      view.srcObject = media
      await view.play()
      const canvas = document.createElement('canvas')
      const drawing = canvas.getContext('2d', { willReadFrequently: true })
      timer = setInterval(() => {
        if (!drawing || view.videoWidth === 0) return
        canvas.width = view.videoWidth
        canvas.height = view.videoHeight
        drawing.drawImage(view, 0, 0)
        const frame = drawing.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(frame.data, frame.width, frame.height)?.data.trim()
        // Another QR code in sight, such as a poster's, is no order's.
        if (!code || !QR_CODE_PATTERN.test(code) || code === told.current) return
        told.current = code
        onRead(code)
      }, EVERY_MS)
    }
    start().catch(() => setUnavailable(true))

    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [onRead, paused])

  if (unavailable) {
    return (
      <p className="text-muted-foreground text-sm">
        <Trans>The camera is not available on this phone. Type the code instead.</Trans>
      </p>
    )
  }
  if (paused) return null
  return (
    <video
      ref={video}
      muted
      playsInline
      className="bg-muted aspect-square w-full max-w-sm rounded-md object-cover"
    >
      <Trans>The camera’s view</Trans>
    </video>
  )
}
