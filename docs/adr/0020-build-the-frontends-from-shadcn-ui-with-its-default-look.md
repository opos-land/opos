# 0020. Build the panel and the portal from shadcn/ui, with its default look until a design exists

- Status: Accepted
- Date: 2026-11-08

## Context

The panel and the portal each had a small `shared/ui` of their own: native elements styled through
placeholder tokens in `src/styles.css`, with shadcn/ui allowed only for a widget native HTML lacks.
No designer's design exists yet ([PRODUCT.md 8](../PRODUCT.md#8-design-and-public-image)). Every
screen hand-styled its forms, tables, alerts and menus, and an agent had no catalogue of components
to reach for.

## Decision

- Both applications build their screens from shadcn/ui components in the `base-nova` style: Base UI
  primitives and lucide icons. Each application has its own `components.json`, and the CLI copies
  the components into its `src/shared/ui`.
- A component stays as the CLI writes it, but for formatting, lint fixes and its own texts moved
  into Lingui macros. What an application needs beyond it, such as a form field wired to its label,
  hint and error, is a composition in a file of its own.
- The tokens of `src/styles.css` carry shadcn/ui's names and, until the designer's tokens arrive,
  its default theme unchanged. The previous placeholder palette and the portal's own control sizes
  are gone.

The rules are in [ARCHITECTURE.md, Frontends](../ARCHITECTURE.md#frontends) and
[PRODUCT.md 8](../PRODUCT.md#8-design-and-public-image).

## Alternatives

- **Own components on native elements**, the previous state. Every widget built and styled by hand,
  and a look of our own invention before any design exists.
- **shadcn/ui only for a widget native HTML lacks.** Two kinds of components side by side, and the
  same hand-styling for everything else.
- **Radix primitives.** shadcn/ui still supports them, but it starts new projects and components on
  Base UI, and the base cannot change without reinstalling every component.
- **A shared `packages/ui`**, shadcn/ui's monorepo layout. The feature-based layout keeps the
  interface in each application's `shared/`, and the two applications serve different people.
- **Keeping the portal's 44 px controls and 16 px form text now.** It changes the components before
  a design exists; touch sizes return with the designer's design.

## Consequences

- The designer's tokens replace the values in `src/styles.css` under shadcn/ui's names; a
  component's classes change only where the design needs more than tokens.
- A component is updated from upstream with `shadcn add <name> --diff`; the local formatting shows
  in that diff.
- Until the design, the portal's controls are 32 px tall and a native select's text is 14 px.
- Tailwind drops a class it cannot build without a word, so each application's
  `src/styles.test.ts` builds every color and radius utility its sources name.
- The applications depend on `@base-ui/react`, `class-variance-authority`, `cn`, `lucide-react`,
  `tw-animate-css` and `@fontsource-variable/geist`, and each pins the `shadcn` CLI.
