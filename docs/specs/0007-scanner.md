# Scanner

- Status: Draft
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Brief: [0001](../briefs/0001-convention-shop.md), B6.1–B6.4
- Decisions: [0059](../adr/0059-pair-a-scanner-with-a-code-and-know-it-by-a-token.md),
  [0060](../adr/0060-read-and-draw-qr-codes-in-the-panels-browser.md) and
  [0065](../adr/0065-let-the-api-name-the-scanner-that-marked-a-hand-out.md), proposed; what the owner
  still has to confirm is among its [open questions](#open-questions)

## Goal

At the gate and at the desk, an org reads a buyer's QR code with a phone and sees whom to let in,
what to hand over and what to check. It serves step 10 of the MVP flow
([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)).

## Business rules

The **From** column names where a rule comes from; "new" marks a rule this draft adds for the
domain owner to confirm. The brief leaves how a device is enabled and revoked to the domain owner:
D7–D13 are this draft's proposal for it.

### The device

| #   | Rule                                                                                                                                                                                                                                                                                                           | From                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| D1  | A scanner is a device with no account signed in. It serves one edition and reads nothing of another.                                                                                                                                                                                                           | PRODUCT.md 3 and 7   |
| D2  | An org with tickets write access to the edition enables its scanners.                                                                                                                                                                                                                                          | PRODUCT.md 5.1       |
| D3  | A scanner's access ends no later than that of the org who enabled it, and an org whose access expires enables none past its own end.                                                                                                                                                                           | PRODUCT.md 5.2 and 7 |
| D4  | A scanner is revoked at any time, and a revoked one reads and records nothing from then on.                                                                                                                                                                                                                    | PRODUCT.md 7         |
| D5  | A scanner works online alone.                                                                                                                                                                                                                                                                                  | PRODUCT.md 11        |
| D6  | The scanner runs in the panel, under its own address, on a phone.                                                                                                                                                                                                                                              | PRODUCT.md 6         |
| D7  | To enable a scanner the org names it in the panel and is shown a pairing code once, as a QR code to read with the phone and as a link. The code works once and for 15 minutes. The phone that opens it becomes the scanner.                                                                                    | new                  |
| D8  | A scanner has a name, unique in its edition, such as the gate it stands at. Every hand-out records it.                                                                                                                                                                                                         | new                  |
| D9  | Unless the org sets an earlier end, a scanner's access ends a day after the edition's last day, within D3.                                                                                                                                                                                                     | new                  |
| D10 | An edition has up to 20 scanners enabled at a time.                                                                                                                                                                                                                                                            | new                  |
| D11 | Any org with tickets write access to the edition revokes any of its scanners. The panel lists each with its name, who enabled it, when it was last used and when its access ends.                                                                                                                              | new                  |
| D12 | A scanner reads QR codes alone: it searches no order by a name, an email or a number. A buyer whose code cannot be read is found by an org in the panel ([order management](0006-order-management.md)).                                                                                                        | new                  |
| D13 | A hand-out marked by mistake is taken back in the panel, not on the scanner.                                                                                                                                                                                                                                   | new                  |
| D14 | An org with tickets write access gives a scanner that is neither revoked nor ended a new pairing code, shown once like the first (D7). From that moment the phone that held the scanner reads and records nothing: the scanner waits for the phone that opens the new code.                                    | new                  |
| D15 | Each scanner has a page of its own in the panel: what the list tells of it, and what it handed out, which is how many orders and lines it marked, when first and last, and the orders it marked last, each linked to its own page. A mark an org made in the panel, and one taken back, are not the scanner's. | new                  |

### A scan

| #   | Rule                                                                                                                                                                                                  | From        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| S1  | Scanning a QR code shows the ticket holder, the age band, the ticket type with its perks, the add-ons and the merchandise with its variants, and whether entry and each item were already handed out. | B6.1        |
| S2  | For a child the scanner says a child enters only with a guardian present; for a teen, only with the guardian's paper consent.                                                                         | B6.2, BR-12 |
| S3  | A QR code of a canceled order, a replaced one and one of another edition's order each show a clear red "Not valid" with the reason. A code the edition does not know shows "Not valid" too.           | B6.3        |
| S4  | A QR code shared by several orders shows every order on it that is not canceled, and is refused once every one is.                                                                                    | F9.4        |
| S5  | A merch-only order's QR code shows no entry: its items alone.                                                                                                                                         | BR-11       |
| S6  | A manual order has nothing to scan, and an order that is not paid has no QR code.                                                                                                                     | B4.5, BR-11 |

### Handing out

| #   | Rule                                                                                                                                          | From                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| H1  | The org marks entry, or one or more items, as handed out on the scanner. The time and the scanner are recorded, and a second scan shows them. | B6.4                                  |
| H2  | A scan marks nothing by itself: the org presses.                                                                                              | B6.4                                  |
| H3  | Two scanners marking the same entry or item at the same moment mark it once: the second is told when and by which scanner it was handed out.  | invariant 10 of ARCHITECTURE.md       |
| H4  | A ticket's perks are handed out with entry: they have no mark of their own.                                                                   | B6.1; that they share the mark is new |
| H5  | A line with a quantity above one is handed out whole.                                                                                         | new                                   |

## Shape

### Tables

| Table             | Holds                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scanner_devices` | edition level: `name`, the membership that enabled it, the hash of its pairing code with `pairing_expires_at`, `paired_at`, the hash of its token, `expires_at`, `last_used_at`, `revoked_at` |

A hand-out is written on the order's line: `order_lines.handed_out_at` and `handed_out_by`
([checkout and orders](0004-checkout-and-orders.md)). The ticket's line is entry.

A pairing code and a device's token each carry at least 128 random bits and are stored as hashes;
the token's lookup returns only the identifiers that open the tenant's context
([ARCHITECTURE.md, Modules waiting for their domain owner](../ARCHITECTURE.md#modules-waiting-for-their-domain-owner)).
The pairing code is the only secret an org ever sees, and it is spent at the pairing: the token is
handed to the paired phone once and shown on no screen.

### Routes

Tenant routes, each under `/editions/{editionId}`:

| Route                                     | Needs                                                      | Refuses with                                                          |
| ----------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /scanners`                           | tickets>=read                                              |                                                                       |
| `GET /scanners/{scannerId}`               | tickets>=read; answers the scanner with what it handed out |                                                                       |
| `POST /scanners`                          | tickets=write; answers the pairing code, once              | `scanner.limit-reached`, `scanner.name-taken`, `scanner.outlives-org` |
| `POST /scanners/{scannerId}/pairing-code` | tickets=write; answers a new pairing code, once            | `scanner.ended` for a scanner revoked or ended                        |
| `DELETE /scanners/{scannerId}`            | tickets=write                                              |                                                                       |

One public route pairs a phone, and a scanner route is a kind of its own in the contract: its
caller is a device, named by its token in `Authorization: Bearer`, with no session and no
membership.

| Route                     | Does                                                                                                           | Refuses with                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `POST /scanner/pair`      | spends a pairing code and answers the device's token, once                                                     | `scanner.code-refused` for a code unknown, used or expired                 |
| `POST /scanner/scans`     | reads a QR code: S1–S5                                                                                         | `scanner.revoked`, `scan.not-valid` with the reason                        |
| `POST /scanner/hand-outs` | marks entry or lines of one order as handed out, each by an update that matches only a line not yet handed out | `scanner.revoked`, `scan.already-handed-out` with the time and the scanner |

The pairing code travels in the request's body, never in a path or a query of the API, and the
link of D7 carries it after the `#`, which no server sees. Pairing, scans and hand-outs each have
a rate limit of their own.

A hand-out names the QR code the scanner read beside the order and its lines: a scanner marks
nothing of an order it did not scan. The add-ons of a ticket are shown with entry and have no
mark of their own on the scanner. The pairing answers, with the token, the scanner's name, its
edition and convention and the convention's time zone, in which the scanner shows every moment.
`scan.not-valid` carries one of four reasons: an unknown code, another edition's, a replaced one,
a canceled order's.

The scanner reads a code with the phone's camera, in the browser, and takes one typed by hand
when the camera cannot read it: the text under a QR picture is the code itself.

### Screens

| Application              | Screen    | Holds                                                                                                 |
| ------------------------ | --------- | ----------------------------------------------------------------------------------------------------- |
| panel, inside an edition | scanners  | the list of D11, a row a scanner that opens its page; the link to the page that enables one           |
| panel, inside an edition | a scanner | the page of D15; a new pairing code, shown once (D14); revoking                                       |
| panel, at `/scanner`     | pair      | opened by the pairing link or code; then the scanner's name and edition                               |
| panel, at `/scanner`     | scan      | the camera's view; after a read, the order of S1 with the notices of S2, or the red "Not valid" of S3 |
| panel, at `/scanner`     | hand out  | entry and each item with its state; the button that marks the chosen ones                             |

Revoking asks first in a modal: no screen brings a device's access back
([0023](../adr/0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)).

### Seed

The demo edition gets two scanners, one of them revoked. Their pairing codes are spent, so the
seed opens no device.

## Tenant isolation and permissions

- A pairing code and a device's token are each looked up by their hash in a new cross-tenant
  query, bound by the secret the caller proved; each returns the tenant, the edition and the
  device alone. A suspended tenant's device is refused where the tenant transaction opens.
- Every query of a scanner route filters on the device's edition: a QR code of another edition is
  "Not valid", never another edition's order (invariant 11).
- A hand-out is one conditional update, never a read followed by a write (invariant 10).
- A scanner reads the names, age bands and lines of the orders it scans, nothing it did not scan,
  and no email address.
- A device's access is judged at each request against its `revoked_at`, its `expires_at` and the
  membership that enabled it, whose expiry and removal end it (D3).
- Enabling a scanner is a write route: it judges its actor again under the tenant's write lock,
  and refuses an end later than the actor's own.
- The device keeps its token in the storage of the panel's origin on that phone. It is no session
  of an account: it opens the scanner routes and nothing else.

These sentences of ARCHITECTURE.md change with the code: the kinds of route a contract starts
from, the cross-tenant queries, how invariants 10 and 11 are enforced, and the frontends' rule
that the browser holds no token, which gains the scanner's.

## Tests

Integration, in `packages/db/test`:

- RLS on `scanner_devices`; `verify` fails on each new cross-tenant read broken once.
- Two hand-outs of one line at the same moment mark it once.

Integration, in `apps/api/test`:

- The org's routes against every actor of the permission matrix; the limit, a taken name and an
  end later than the org's own refused.
- Pairing: a code used twice, an expired one and an unknown one refused; the token answered once.
- The scanner routes with no token, an unknown one, a revoked device, an expired one, a device
  whose enabling org expired or was removed, a device of another edition and of another tenant, a
  suspended tenant.
- A scan of each kind of S1–S6: a ticket with add-ons and merchandise, a child, a teen, a
  merch-only order, a shared code with one order canceled and with all canceled, a canceled order,
  a replaced code, another edition's code, an unknown one.
- A hand-out: entry alone, items alone, a second marking refused with the first one's time and
  scanner.

e2e, on a mobile viewport: an org enables a scanner and a phone pairs with its code; the scanner
reads a paid order's QR code, hands out entry and one item, and a second scan shows both as handed
out; a canceled order's code shows "Not valid"; a revoked scanner reads nothing. The scenario
types each code, as a person reads it out: a browser under test has no camera to show a code to.

## Out of scope

- Offline scanning ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).
- A signed-in desk user scanning: the scanner is a device with no account.
- Selling at the desk, marking a hand-out without a code and taking one back: the panel, in
  [order management](0006-order-management.md).
- How an attendee badge handed out at the desk is identified: programme sign-ups.

## Open questions

- **The device's rules (D7–D15):** they are this draft's proposal. The brief leaves enabling and
  revoking a device to the domain owner, who has not set them yet.
- **Records to accept:** how a phone is paired and known, proposed in 0059, and reading QR codes
  in the browser, proposed in 0060.
- **For the domain owner to confirm:** that the add-ons of a ticket have no mark of their own on
  the scanner; that a code may be typed by hand on the scanner, which D12 does not name; that
  the list of scanners names who enabled each by an address only to a member who may read the
  team.
- **What a scanner's page counts (D15):** a scan that hands nothing out leaves no trace but the
  moment the scanner was last used, so the page counts hand-outs, not reads. A list of every read
  would be a table of its own, and one more record of who was where and when: the owner's to
  ask for.
- **A new pairing code (D14):** it takes the scanner from its phone at once, not when another
  phone opens the code. A code that stayed readable on the scanner's page was turned down with a
  pairing code that stays valid ([0059](../adr/0059-pair-a-scanner-with-a-code-and-know-it-by-a-token.md)).
- **When the org behind a scanner loses access:** the scanner stops once that org's membership
  expires or is removed, which is what the device's rules here ask. ARCHITECTURE.md says a
  device's access ends no later than that of the org who enabled it, which may also be read as
  that org's tickets permission of the edition: an org whose permission was lowered to none
  keeps a working scanner until another org revokes it. Which reading holds is the owner's to
  say; the stricter one would judge the permission at every request of the device.
