# 0065. Let the API name the scanner that marked a hand-out

- Status: Accepted
- Date: 2026-11-20

## Context

The role the API runs as never updates a column that points a row at an account or another row
([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation)). One pointer is
changed in place already, the variant a merchandise line names, and its record asks any second
one for a record of its own and the same proof
([0058](0058-let-the-api-change-the-variant-an-order-line-names.md)).

A hand-out is one update of an order's line that matches only a line not yet handed out
([ARCHITECTURE.md, invariant 10](../ARCHITECTURE.md#invariants)). The org at the gate has to see
which scanner marked a line, and an org in the panel takes a mark back.

## Decision

- `opos_app` updates `order_lines.handed_out_by`, the scanner that marked the line, together
  with the moment of the mark. It is the second pointer the role changes in place, and no third.
- The line cannot leave its edition or its tenant by it: the line's foreign key spans the
  scanner with the tenant and the edition the line has, a check allows a scanner only on a line
  that is handed out, and the role updates neither the tenant, the edition nor the order of a
  line.
- A mark made in the panel names no scanner, and a mark taken back clears it.

## Alternatives

- **A row for each hand-out, as an order carries its QR code by a row.** A table and a join for
  one name beside a moment, and a hand-out that would no longer be one update of one row: two
  scans at the same moment would each insert.
- **The scanner's name copied onto the line.** A name an org gave a device, kept where it can
  no longer be told from another device of the same name.
- **No word of who marked it.** At a gate with several scanners nobody could say where a ticket
  was let in.

## Consequences

- The verifier lists the column among the role's updates, and the tests of the database prove
  that the role cannot point a line at a scanner of another edition or of another tenant.
- A scanner is never deleted while a line names it: the role has no delete on scanners.
