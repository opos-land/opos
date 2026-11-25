import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScannerPage } from './scanner-page'

const device = vi.hoisted(() => ({
  pair: vi.fn(),
  scan: vi.fn(),
  handOut: vi.fn(),
}))

vi.mock('../api/scanner-device', () => ({
  pairScanner: device.pair,
  scanCode: device.scan,
  handOutLines: device.handOut,
}))
// No camera in the test's browser: the code is typed.
vi.mock('../components/qr-reader', () => ({ QrReader: () => null }))

const CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const paired = {
  token: 'the-token',
  name: 'Main gate',
  editionName: 'Edition 2026',
  conventionName: 'Convention A',
  timezone: 'Europe/Warsaw',
  expiresAt: '2099-01-01T00:00:00.000Z',
}
const shown = (fields: object = {}) => ({
  orders: [
    {
      orderId: 'order-1',
      number: 'ABCDEFGHJK',
      holderName: 'Ada Lovelace',
      ageBand: 'adult',
      entry: {
        lineId: 'line-entry',
        ticketType: 'Standard',
        perks: ['Badge', 'Lanyard'],
        handedOutAt: null,
        handedOutBy: null,
      },
      addOns: [{ lineId: 'line-room', name: 'Room', handedOutAt: null, handedOutBy: null }],
      items: [
        {
          lineId: 'line-shirt',
          name: 'T-shirt',
          variant: ['M'],
          quantity: 2,
          handedOutAt: null,
          handedOutBy: null,
        },
      ],
      ...fields,
    },
  ],
})

const view = (hash = '') => {
  window.history.replaceState(null, '', `/scanner${hash}`)
  return render(
    <I18nProvider i18n={i18n}>
      <ScannerPage />
    </I18nProvider>,
  )
}

/** Types a code as a person reads it out, and reads it. */
async function read(code = CODE) {
  fireEvent.change(await screen.findByLabelText('QR code'), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: 'Read the code' }))
}

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
})

beforeEach(() => {
  localStorage.clear()
  device.pair.mockResolvedValue(paired)
  device.scan.mockResolvedValue(shown())
  device.handOut.mockResolvedValue(shown())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('a phone that is no scanner yet', () => {
  it('asks for the pairing link an organizer shows', async () => {
    view()

    expect(await screen.findByText(/Open the pairing link/)).toBeDefined()
    expect(device.pair).not.toHaveBeenCalled()
  })

  it('spends the code of the link it was opened with, and becomes the scanner', async () => {
    view('#the-pairing-code')

    expect(await screen.findByRole('heading', { name: 'Main gate' })).toBeDefined()
    expect(screen.getByText(/Edition 2026/)).toBeDefined()
    expect(device.pair).toHaveBeenCalledWith('the-pairing-code')
    // The token stays on the phone, and the code leaves the address.
    expect(JSON.parse(localStorage.getItem('opos.scanner')!)).toMatchObject({ token: 'the-token' })
    expect(window.location.hash).toBe('')
  })

  it('says when the code no longer works', async () => {
    device.pair.mockRejectedValue(new ORPCError('scanner.code-refused', { status: 403 }))
    view('#an-old-code')

    expect(await screen.findByText(/pairing code does not work/i)).toBeDefined()
    expect(localStorage.getItem('opos.scanner')).toBeNull()
  })

  // A link pasted into the address of the tab that shows the scanner already loads no page anew:
  // only the part after the `#` changes.
  it('spends the code of a link opened in the tab that shows the scanner already', async () => {
    view()
    expect(await screen.findByText(/Open the pairing link/)).toBeDefined()

    window.location.hash = '#the-pairing-code'

    expect(await screen.findByRole('heading', { name: 'Main gate' })).toBeDefined()
    expect(device.pair).toHaveBeenCalledWith('the-pairing-code')
    expect(JSON.parse(localStorage.getItem('opos.scanner')!)).toMatchObject({ token: 'the-token' })
    expect(window.location.hash).toBe('')
  })

  it('spends a new code in the same tab after one that no longer works', async () => {
    device.pair.mockRejectedValueOnce(new ORPCError('scanner.code-refused', { status: 403 }))
    view('#an-old-code')
    expect(await screen.findByText(/pairing code does not work/i)).toBeDefined()

    window.location.hash = '#a-new-code'

    expect(await screen.findByRole('heading', { name: 'Main gate' })).toBeDefined()
    expect(device.pair).toHaveBeenLastCalledWith('a-new-code')
    expect(window.location.hash).toBe('')
  })
})

describe('a scanner', () => {
  beforeEach(() => {
    localStorage.setItem('opos.scanner', JSON.stringify(paired))
  })

  // The phone that opens a pairing link becomes its scanner, whatever scanner it was before.
  it('becomes the scanner of a pairing link opened on it, in place of the one it was', async () => {
    device.pair.mockResolvedValue({ ...paired, token: 'the-new-token', name: 'Desk' })
    view('#another-code')

    expect(await screen.findByRole('heading', { name: 'Desk' })).toBeDefined()
    expect(device.pair).toHaveBeenCalledWith('another-code')
    expect(screen.queryByRole('heading', { name: 'Main gate' })).toBeNull()
    expect(JSON.parse(localStorage.getItem('opos.scanner')!)).toMatchObject({
      token: 'the-new-token',
      name: 'Desk',
    })
    expect(window.location.hash).toBe('')
    // It reads as the scanner it became.
    await read()
    await waitFor(() => expect(device.scan).toHaveBeenCalledWith('the-new-token', CODE))
  })

  it('stays the scanner it is when the code of the link is refused, and says so', async () => {
    device.pair.mockRejectedValue(new ORPCError('scanner.code-refused', { status: 403 }))
    view('#an-old-code')

    expect(await screen.findByText(/pairing code does not work/i)).toBeDefined()
    expect(device.pair).toHaveBeenCalledWith('an-old-code')
    expect(screen.getByRole('heading', { name: 'Main gate' })).toBeDefined()
    expect(JSON.parse(localStorage.getItem('opos.scanner')!)).toMatchObject({ token: 'the-token' })
    expect(window.location.hash).toBe('')
  })

  it('becomes the scanner of a link opened in the tab it scans in, and shows no order of the one it was', async () => {
    device.pair.mockResolvedValue({ ...paired, token: 'the-new-token', name: 'Desk' })
    view()
    await read()
    expect(await screen.findByText('Ada Lovelace')).toBeDefined()

    window.location.hash = '#another-code'

    expect(await screen.findByRole('heading', { name: 'Desk' })).toBeDefined()
    expect(screen.queryByText('Ada Lovelace')).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('reads a code and shows whom to let in and what to hand over', async () => {
    view()

    await read(` ${CODE.toLowerCase()} `)

    expect(await screen.findByText('Ada Lovelace')).toBeDefined()
    expect(device.scan).toHaveBeenCalledWith('the-token', CODE)
    expect(screen.getByText('Standard')).toBeDefined()
    expect(screen.getByText('Badge, Lanyard')).toBeDefined()
    expect(screen.getByText('Room')).toBeDefined()
    expect(screen.getByText('2 × T-shirt (M)')).toBeDefined()
    // A scan marks nothing by itself.
    expect(device.handOut).not.toHaveBeenCalled()
  })

  it.each([
    ['child', /enters only with a guardian present/],
    ['teen', /only with the guardian’s consent on paper/],
  ])('says what to check for a %s', async (ageBand, notice) => {
    device.scan.mockResolvedValue(shown({ ageBand }))
    view()

    await read()

    expect(await screen.findByText(notice)).toBeDefined()
  })

  it('marks what the org chose as handed out, under the code it read', async () => {
    device.handOut.mockResolvedValue(
      shown({
        entry: {
          lineId: 'line-entry',
          ticketType: 'Standard',
          perks: [],
          handedOutAt: '2026-06-05T09:00:00.000Z',
          handedOutBy: 'Main gate',
        },
      }),
    )
    view()
    await read()

    fireEvent.click(await screen.findByRole('checkbox', { name: /Entry/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /T-shirt/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark as handed out' }))

    await waitFor(() =>
      expect(device.handOut).toHaveBeenCalledWith('the-token', {
        code: CODE,
        orderId: 'order-1',
        lineIds: ['line-entry', 'line-shirt'],
      }),
    )
    // What was handed out says when and by which scanner, and is offered no more.
    expect(await screen.findByText(/Handed out .* by Main gate/)).toBeDefined()
    expect(screen.queryByRole('checkbox', { name: /Entry/ })).toBeNull()
  })

  // docs/specs/0007-scanner.md, H1 and H4: a perk goes with entry, an add-on has a mark of its own.
  it('marks each add-on on its own, as its order’s page does', async () => {
    device.handOut.mockResolvedValue(
      shown({
        addOns: [
          {
            lineId: 'line-room',
            name: 'Room',
            handedOutAt: '2026-06-05T09:00:00.000Z',
            handedOutBy: 'Main gate',
          },
        ],
      }),
    )
    view()
    await read()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Room' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark as handed out' }))

    await waitFor(() =>
      expect(device.handOut).toHaveBeenCalledWith('the-token', {
        code: CODE,
        orderId: 'order-1',
        lineIds: ['line-room'],
      }),
    )
    expect(await screen.findByText(/Handed out .* by Main gate/)).toBeDefined()
    expect(screen.queryByRole('checkbox', { name: 'Room' })).toBeNull()
    // Entry is still to be marked: the add-on went alone.
    expect(screen.getByRole('checkbox', { name: /Entry/ })).toBeDefined()
  })

  // docs/specs/0007-scanner.md, H3: the second of two scanners is told when and by which the
  // first handed it out.
  it('reads the order again when another scanner was first, and shows its mark', async () => {
    device.handOut.mockRejectedValue(
      new ORPCError('scan.already-handed-out', {
        status: 409,
        data: {
          lineId: 'line-entry',
          handedOutAt: '2026-06-05T09:00:00.000Z',
          scanner: 'Side gate',
        },
      }),
    )
    view()
    await read()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Entry/ }))
    device.scan.mockResolvedValue(
      shown({
        entry: {
          lineId: 'line-entry',
          ticketType: 'Standard',
          perks: [],
          handedOutAt: '2026-06-05T09:00:00.000Z',
          handedOutBy: 'Side gate',
        },
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mark as handed out' }))

    expect(await screen.findByText(/Handed out .* by Side gate/)).toBeDefined()
    expect(device.scan).toHaveBeenLastCalledWith('the-token', CODE)
    expect(screen.queryByRole('checkbox', { name: /Entry/ })).toBeNull()
    // The refusal stays on screen, and what is left is still offered.
    expect(screen.getByText('This was already handed out.')).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'Room' })).toBeDefined()
  })

  it('shows the add-ons of an order with no ticket, each to be marked', async () => {
    device.scan.mockResolvedValue(shown({ entry: null, ageBand: null, items: [] }))
    view()

    await read()

    expect(await screen.findByRole('checkbox', { name: 'Room' })).toBeDefined()
  })

  it('shows items alone for an order with no ticket', async () => {
    device.scan.mockResolvedValue(shown({ entry: null, ageBand: null, addOns: [] }))
    view()

    await read()

    expect(await screen.findByText('2 × T-shirt (M)')).toBeDefined()
    expect(screen.queryByRole('checkbox', { name: /Entry/ })).toBeNull()
  })

  it.each([
    ['canceled', /order was canceled/],
    ['replaced', /code was replaced/],
    ['other-edition', /another edition/],
    ['unknown', /does not know this code/],
  ])('shows a clear "Not valid" for a code that is %s', async (reason, text) => {
    device.scan.mockRejectedValue(
      new ORPCError('scan.not-valid', { status: 409, data: { reason } }),
    )
    view()

    await read()

    const alert = within(await screen.findByRole('alert'))
    expect(alert.getByText('Not valid')).toBeDefined()
    expect(alert.getByText(text)).toBeDefined()
  })

  it('reads no text that is not a QR code', async () => {
    view()

    await read('Ada Lovelace')

    expect(await screen.findByText(/A QR code has 32 characters/)).toBeDefined()
    expect(device.scan).not.toHaveBeenCalled()
  })

  // A refusal that passes: the scanner and its token stand, and the organizer who enabled it
  // cannot manage tickets at the moment.
  it('keeps its token while it is stopped, says why, and reads again once it is not', async () => {
    device.scan.mockRejectedValueOnce(new ORPCError('scanner.stopped', { status: 403 }))
    view()

    await read()

    expect(await screen.findByText(/scanner is stopped for now/i)).toBeDefined()
    expect(JSON.parse(localStorage.getItem('opos.scanner')!)).toMatchObject({ token: 'the-token' })
    expect(screen.getByRole('heading', { name: 'Main gate' })).toBeDefined()
    // Nothing is read meanwhile.
    expect(screen.queryByLabelText('QR code')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Ada Lovelace')).toBeDefined()
    expect(device.scan).toHaveBeenLastCalledWith('the-token', CODE)
    expect(screen.queryByText(/scanner is stopped for now/i)).toBeNull()
  })

  it('stays stopped while trying again is refused the same way, and is no scanner once the refusal lasts', async () => {
    device.scan.mockRejectedValue(new ORPCError('scanner.stopped', { status: 403 }))
    view()
    await read()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(device.scan).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeDefined()
    expect(localStorage.getItem('opos.scanner')).not.toBeNull()

    device.scan.mockRejectedValue(new ORPCError('scanner.revoked', { status: 401 }))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(/scanner no longer works/i)).toBeDefined()
    expect(localStorage.getItem('opos.scanner')).toBeNull()
  })

  it('is stopped when a hand-out is refused so, and reads the order again once it is not', async () => {
    device.handOut.mockRejectedValue(new ORPCError('scanner.stopped', { status: 403 }))
    view()
    await read()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Entry/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Mark as handed out' }))

    expect(await screen.findByText(/scanner is stopped for now/i)).toBeDefined()
    expect(localStorage.getItem('opos.scanner')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('checkbox', { name: /Entry/ })).toBeDefined()
    expect(device.scan).toHaveBeenCalledTimes(2)
    expect(device.scan).toHaveBeenLastCalledWith('the-token', CODE)
  })

  it('stops being a scanner once its access is revoked', async () => {
    device.scan.mockRejectedValue(new ORPCError('scanner.revoked', { status: 401 }))
    view()

    await read()

    expect(await screen.findByText(/scanner no longer works/i)).toBeDefined()
    expect(localStorage.getItem('opos.scanner')).toBeNull()
  })
})
