# Briefs

Working material that binds nothing: a domain owner's brief, a review of a running system seen
through the browser, research or notes that state business needs before they become a
[spec](../specs/README.md). Decided in [0028](../adr/0028-keep-non-binding-briefs-in-docs-briefs.md).

## Rules

- Any shape that helps. A header with the date, the domain owner (a role) and the source is
  suggested.
- English; Polish only as the quoted rendering of a term. Roles, never personal names
  ([CONTRIBUTORS.md](../../CONTRIBUTORS.md) says who holds them); no secret and no real person's
  personal data.
- [PRODUCT.md](../PRODUCT.md), [ARCHITECTURE.md](../ARCHITECTURE.md), the
  [records](../adr/README.md), the specs and the code hold over a brief. A brief worked toward a spec
  lists where it disagrees with them, for its domain owner to decide.
- A spec built from a brief links it; no rule of the documents or the records rests on one.
- A brief is named `NNNN-title.md`, numbered in the order briefs arrive, for a rough ordering;
  nothing checks the numbers.
- Briefs are not checked for links or shape.
- A brief nobody works from any more is deleted; git keeps it.

## Index

| Brief | Holds |
|---|---|
| [0001](0001-convention-shop.md) | the convention shop, from an outside review of a running system reworked against the product's decisions: the working copy toward the specs of the tickets module |
| [0002](0002-convention-shop-review.md) | a review of 0001: gaps in payments read against the Przelewy24 documentation, consumer law and the practice of online shops, for the domain owner to decide |
