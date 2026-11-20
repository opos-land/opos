# 0060. Read and draw QR codes in the panel's browser

- Status: Proposed
- Date: 2026-11-20

## Context

The panel shows a pairing code as a QR code, and the scanner reads a buyer's QR code with a
phone's camera ([scanner](../specs/0007-scanner.md)). Both codes are secrets: a pairing code makes
a scanner, and an order's QR code is its ticket.

The panel and the admin application load nothing from another origin and hold no tracker
([0026](0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)). A browser's own barcode
reader is missing on the phones a convention's volunteers bring, iPhones among them.

## Decision

- The panel draws a QR code with `qrcode`, the library the API already draws an order's code
  with, and reads one with `jsqr`. Both run in the browser, from the panel's own bundle.
- A camera frame is drawn to a canvas and decoded on the phone. No picture and no code is sent
  anywhere to be read.
- The reader tells only a text in the shape of an order's QR code: another code in sight is no
  order's.
- A code is also typed by hand: the text under a QR picture is the code itself, in characters a
  person reads out.

## Alternatives

- **The browser's `BarcodeDetector`.** No library to ship, and no reader on Safari.
- **A service that reads the picture.** A photograph of a buyer's ticket sent to a third party.
- **A native application.** A store listing, a review and an installation on a volunteer's own
  phone, for one screen.

## Consequences

- The reader loads with the scanner's page alone, where a camera is opened.
- Decoding in script costs a phone's battery: a frame is read five times a second, not at the
  camera's own rate.
- The scanner asks the phone for its camera; where the phone gives none, the code is typed.
