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
})

describe('a scanner', () => {
  beforeEach(() => {
    localStorage.setItem('opos.scanner', JSON.stringify(paired))
  })

  // A pairing link opened on a phone that is a scanner already pairs nothing, and its code
  // stays in no address.
  it('stays the scanner it is when a pairing link is opened on it, and drops the code', async () => {
    view('#another-code')

    expect(await screen.findByRole('heading', { name: 'Main gate' })).toBeDefined()
    await waitFor(() => expect(window.location.hash).toBe(''))
    expect(device.pair).not.toHaveBeenCalled()
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

  it('stops being a scanner once its access is revoked', async () => {
    device.scan.mockRejectedValue(new ORPCError('scanner.revoked', { status: 401 }))
    view()

    await read()

    expect(await screen.findByText(/scanner no longer works/i)).toBeDefined()
    expect(localStorage.getItem('opos.scanner')).toBeNull()
  })
})
