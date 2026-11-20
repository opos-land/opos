import { Trans, useLingui } from '@lingui/react/macro'
import {
  type PairedScanner,
  QR_CODE_PATTERN,
  type ScanRefusal,
  type ScanResult,
} from '@opos/contract'
import { formatDateTime, isLocale } from '@opos/i18n'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { errorCode } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import { Button, CheckboxField, ErrorMessage, FormField, Input } from '../../../shared/ui'
import { handOutLines, pairScanner, scanCode } from '../api/scanner-device'
import { QrReader } from '../components/qr-reader'
import { codeFromHash, forgetDevice, readDevice, saveDevice } from '../model/device'
import { AGE_NOTICES, REFUSAL_LABELS } from '../model/labels'

type ScannedOrder = ScanResult['orders'][number]

/** The reason a scan was refused with, as the API's error carries it. */
const refusalOf = (error: unknown): ScanRefusal | null => {
  const reason = (error as { data?: { reason?: unknown } }).data?.reason
  return typeof reason === 'string' && reason in REFUSAL_LABELS ? (reason as ScanRefusal) : null
}

/**
 * The scanner (`/scanner`), on a phone with no account signed in
 * (docs/specs/0007-scanner.md): opened with a pairing link it becomes a scanner; as one it reads
 * a buyer's QR code, shows whom to let in and what to hand over, and marks what the org chose as
 * handed out. A scan marks nothing by itself.
 */
export function ScannerPage() {
  const { t } = useLingui()
  usePageTitle(t`Scanner`)
  const [device, setDevice] = useState(() => readDevice())
  const [failure, setFailure] = useState<unknown>(null)
  const [ended, setEnded] = useState(false)
  const pairing = useRef(false)

  useEffect(() => {
    const code = codeFromHash(window.location.hash)
    if (!code || pairing.current || readDevice()) return
    pairing.current = true
    // The code leaves the address before it is spent: it stays in no history.
    window.history.replaceState(null, '', window.location.pathname)
    pairScanner(code).then(
      (paired) => {
        saveDevice(paired)
        setDevice(paired)
      },
      (error: unknown) => setFailure(error),
    )
  }, [])

  const revoked = useCallback(() => {
    forgetDevice()
    setDevice(null)
    setEnded(true)
  }, [])

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4">
      {device ? (
        <Scanning device={device} onRevoked={revoked} />
      ) : (
        <>
          <h1 className="text-2xl font-semibold">
            <Trans>Scanner</Trans>
          </h1>
          {ended && (
            <p role="alert" className="text-sm">
              <Trans>
                This scanner no longer works: its access was revoked or has ended. Ask an organizer
                to pair this phone again.
              </Trans>
            </p>
          )}
          <ErrorMessage error={failure} />
          <p className="text-sm">
            <Trans>
              This phone is no scanner yet. Open the pairing link an organizer shows you in the
              panel, or read its QR code with the camera.
            </Trans>
          </p>
        </>
      )}
    </main>
  )
}

/** The scanner at work: the camera's view, the code typed by hand, and what a read showed. */
function Scanning({ device, onRevoked }: { device: PairedScanner; onRevoked: () => void }) {
  const [typed, setTyped] = useState('')
  const [mistyped, setMistyped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState<{ code: string; result: ScanResult } | null>(null)
  const [refusal, setRefusal] = useState<ScanRefusal | null>(null)
  const [problem, setProblem] = useState<unknown>(null)

  const failed = useCallback(
    (error: unknown) => {
      const code = errorCode(error)
      if (code === 'scanner.revoked') return onRevoked()
      const reason = code === 'scan.not-valid' ? refusalOf(error) : null
      if (reason) {
        setScan(null)
        setRefusal(reason)
      } else setProblem(error)
    },
    [onRevoked],
  )

  const read = useCallback(
    async (raw: string) => {
      // Read out at the desk and typed in small letters, it is the same code.
      const code = raw.trim().toUpperCase()
      if (!QR_CODE_PATTERN.test(code)) return setMistyped(true)
      setMistyped(false)
      setRefusal(null)
      setProblem(null)
      setBusy(true)
      try {
        setScan({ code, result: await scanCode(device.token, code) })
        setTyped('')
      } catch (error) {
        failed(error)
      } finally {
        setBusy(false)
      }
    },
    [device.token, failed],
  )
  const onCamera = useCallback((code: string) => void read(code), [read])

  const handOut = async (orderId: string, lineIds: string[]) => {
    if (!scan) return
    setProblem(null)
    setBusy(true)
    try {
      const result = await handOutLines(device.token, { code: scan.code, orderId, lineIds })
      setScan({ code: scan.code, result })
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }
  const next = () => {
    setScan(null)
    setRefusal(null)
    setProblem(null)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void read(typed)
  }
  const { editionName, conventionName } = device

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{device.name}</h1>
        <p className="text-muted-foreground text-sm">
          <Trans>
            Scanner of {editionName}, {conventionName}
          </Trans>
        </p>
      </header>
      <ErrorMessage error={problem} />
      {refusal && <NotValid reason={refusal} />}
      {scan?.result.orders.map((order) => (
        <Order
          key={order.orderId}
          order={order}
          timezone={device.timezone}
          busy={busy}
          onHandOut={(lineIds) => void handOut(order.orderId, lineIds)}
        />
      ))}
      {scan || refusal ? (
        <Button variant="outline" onClick={next}>
          <Trans>Read the next code</Trans>
        </Button>
      ) : (
        <>
          <QrReader onRead={onCamera} paused={busy} />
          <form onSubmit={submit} className="flex flex-col gap-3">
            <FormField
              label={<Trans>QR code</Trans>}
              hint={
                <Trans>Type the code under the QR picture when the camera cannot read it.</Trans>
              }
              error={mistyped && <Trans>A QR code has 32 characters: letters and digits.</Trans>}
            >
              {(control) => (
                <Input
                  {...control}
                  value={typed}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  onChange={(event) => setTyped(event.target.value)}
                />
              )}
            </FormField>
            <Button type="submit" disabled={busy || typed.trim() === ''}>
              <Trans>Read the code</Trans>
            </Button>
          </form>
        </>
      )}
    </>
  )
}

/** The clear red "Not valid" of a code that opens nothing here, with the reason. */
function NotValid({ reason }: { reason: ScanRefusal }) {
  const { t } = useLingui()
  return (
    <div
      role="alert"
      className="border-destructive bg-destructive/10 text-destructive rounded-md border-2 p-4"
    >
      <p className="text-2xl font-bold">
        <Trans>Not valid</Trans>
      </p>
      <p className="text-sm">{t(REFUSAL_LABELS[reason])}</p>
    </div>
  )
}

/** When and by which scanner something was handed out; a mark of the panel names none. */
function Mark({ at, by, timezone }: { at: string; by: string | null; timezone: string }) {
  const { i18n } = useLingui()
  const when = formatDateTime(new Date(at), isLocale(i18n.locale) ? i18n.locale : 'en', timezone)
  return (
    <span className="text-muted-foreground text-sm">
      {by ? (
        <Trans>
          Handed out {when} by {by}
        </Trans>
      ) : (
        <Trans>Handed out {when} in the panel</Trans>
      )}
    </span>
  )
}

/** An order a code opened: its ticket holder, entry and items, and the marks the org makes. */
function Order({
  order,
  timezone,
  busy,
  onHandOut,
}: {
  order: ScannedOrder
  timezone: string
  busy: boolean
  onHandOut: (lineIds: string[]) => void
}) {
  const { t } = useLingui()
  const [chosen, setChosen] = useState<string[]>([])
  const choose = (lineId: string, checked: boolean) =>
    setChosen((held) => (checked ? [...held, lineId] : held.filter((id) => id !== lineId)))
  const notice = order.ageBand ? AGE_NOTICES[order.ageBand] : undefined
  // In the order of the page: entry, then the items.
  const open = [order.entry, ...order.items].flatMap((line) =>
    line && !line.handedOutAt ? [line.lineId] : [],
  )
  const picked = open.filter((lineId) => chosen.includes(lineId))
  const { number } = order

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <header>
        <h2 className="text-xl font-semibold">{order.holderName || <Trans>No name</Trans>}</h2>
        <p className="text-muted-foreground font-mono text-sm">
          <Trans>Order {number}</Trans>
        </p>
      </header>
      {notice && (
        <p role="note" className="border-primary rounded-md border-2 p-3 font-medium">
          {t(notice)}
        </p>
      )}
      {order.entry && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">{order.entry.ticketType}</p>
          {order.entry.perks.length > 0 && (
            <p className="text-sm">{order.entry.perks.join(', ')}</p>
          )}
          {order.addOns.length > 0 && (
            <ul className="text-sm">
              {order.addOns.map((addOn) => (
                <li key={addOn.lineId}>{addOn.name}</li>
              ))}
            </ul>
          )}
          {order.entry.handedOutAt ? (
            <p>
              <Trans>Entry</Trans>{' '}
              <Mark at={order.entry.handedOutAt} by={order.entry.handedOutBy} timezone={timezone} />
            </p>
          ) : (
            <CheckboxField
              label={<Trans>Entry</Trans>}
              checked={chosen.includes(order.entry.lineId)}
              disabled={busy}
              onChange={(checked) => choose(order.entry!.lineId, checked)}
            />
          )}
        </div>
      )}
      {order.items.map((item) => {
        const name =
          item.variant.length > 0 ? `${item.name} (${item.variant.join(', ')})` : item.name
        const label = item.quantity > 1 ? `${item.quantity} × ${name}` : name
        return item.handedOutAt ? (
          <p key={item.lineId}>
            {label} <Mark at={item.handedOutAt} by={item.handedOutBy} timezone={timezone} />
          </p>
        ) : (
          <CheckboxField
            key={item.lineId}
            label={label}
            checked={chosen.includes(item.lineId)}
            disabled={busy}
            onChange={(checked) => choose(item.lineId, checked)}
          />
        )
      })}
      {open.length > 0 && (
        <Button disabled={busy || picked.length === 0} onClick={() => onHandOut(picked)}>
          <Trans>Mark as handed out</Trans>
        </Button>
      )}
    </section>
  )
}
