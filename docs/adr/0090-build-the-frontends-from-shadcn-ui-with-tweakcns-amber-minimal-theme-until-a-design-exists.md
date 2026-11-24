# 0090. Build the frontends from shadcn/ui, with tweakcn's Amber Minimal theme until a design exists

- Status: Accepted
- Date: 2026-11-24

## Context

The panel, the portal and the admin application build their screens from shadcn/ui components and
carried its default theme unchanged until the designer's tokens arrive
([0020](0020-build-the-frontends-from-shadcn-ui-with-its-default-look.md)). That theme is grey on
white with one sans-serif font: the screens had no color and no typography to speak of, and the
team wanted a look with both while the design is still to come.

tweakcn publishes themes as shadcn/ui registry items. Its Amber Minimal theme sets the tokens
shadcn/ui's components read, a light and a dark set, and names Inter, JetBrains Mono and Source
Serif 4, which tweakcn expects a page to load from Google Fonts. Applied as published, three of its
text colors fall short of the 4.5:1 that WCAG 2.1 AA asks of text, which the shop and the buyer's
pages must meet ([0084](0084-meet-wcag-2-1-aa-on-the-shops-and-the-buyers-pages.md)): amber links
and the red of errors on a light surface, and white on the amber of the sidebar.

## Decision

- The three applications build their screens from shadcn/ui components in the `base-nova` style:
  Base UI primitives and lucide icons. Each application has its own `components.json`, and its
  pinned CLI copies the components into its `src/shared/ui`.
- A component stays as the CLI writes it, but for formatting, lint fixes and its own texts moved
  into Lingui macros. What an application needs beyond it is a composition in a file of its own.
- The tokens of `src/styles.css` carry shadcn/ui's names and, until the designer's tokens arrive,
  tweakcn's Amber Minimal theme: its colors, radius, shadows and three font families, the same in
  every application.
- Where the theme's text falls short of 4.5:1 against its surface, the tokens depart from it, in
  the tokens alone: links take a deeper amber than the buttons' fill, errors shadcn/ui's red, and
  the sidebar's amber black text, as the buttons' does.
- The fonts are packages of the applications, served from each application's own origin with the
  Latin Extended letters Polish needs.

The rules are in [ARCHITECTURE.md, Frontends](../ARCHITECTURE.md#frontends) and
[PRODUCT.md 8](../PRODUCT.md#8-design-and-public-image).

## Alternatives

- **shadcn/ui's default theme unchanged**, the previous state. Honest, but grey and without
  typography, which is what the team wanted to leave.
- **A palette of our own.** A look invented before any design exists; a published theme is a
  placeholder no one mistakes for the design.
- **The theme exactly as tweakcn publishes it.** Its links and errors would break WCAG 2.1 AA on
  the shop's pages, and its output for Tailwind 4 carries editor settings that refer to themselves
  and equal Tailwind's defaults.
- **Darkening the theme's primary color for every use.** It meets the contrast, but turns the amber
  buttons brown and the look harder; the text alone needs the deeper tone.
- **The fonts from Google Fonts**, as tweakcn expects. A font from another origin is a tracker: the
  panel and the admin application hold none, and the portal runs one only through the consent
  banner ([0026](0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)).

## Consequences

- The designer's tokens replace these values under shadcn/ui's names; a component's classes change
  only where the design needs more than tokens.
- `text-primary` reads a token of its own, `--primary-text`, before `--primary`; a new token pair
  that carries text keeps 4.5:1 in both themes.
- Each application's `src/styles.test.ts` fails on a class Tailwind cannot build, on a font family a
  token names that no `@font-face` of the stylesheet loads with the Polish letters, and on a text
  token under 4.5:1 against its surface in either theme.
- Each build carries the three variable fonts in every subset their packages ship; a browser
  downloads only a family the page uses and a subset its text needs.
- The applications depend on `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`
  and `@fontsource-variable/source-serif-4` in place of `@fontsource-variable/geist`.
