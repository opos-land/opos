# 0025. Keep the theme on the account, and a visitor's in the browser

- Status: Accepted
- Date: 2026-11-11

## Context

The panel and the portal carry shadcn/ui's default tokens, a light and a dark set
([0020](0020-build-the-frontends-from-shadcn-ui-with-its-default-look.md)), but showed only the
light one. The team decided that each user chooses between a light and a dark theme, that the
choice is kept per user in the database, and that with no choice there the interface shows the
system's theme. A toggle between the two had to be in reach on every screen, for a signed-in
account and for a visitor with no account signed in, without opening the account page.

## Decision

- The theme is light or dark. A signed-in account's choice is kept on the account, beside its
  interface language, and changed through `PATCH /me`, so it follows the account to every device
  and into both applications.
- An account with no choice shows the system's theme, followed as the system changes it, even
  where the browser holds a visitor's choice.
- A visitor with no account signed in chooses in the browser, in the storage of the application;
  with no choice, the system's theme.
- The browser never keeps an account's theme: once the account signs out, the visitor's choice,
  or the system's theme, comes back
  ([ARCHITECTURE.md, Frontends](../ARCHITECTURE.md#frontends)).
- Every screen of the panel and the portal offers a toggle between the light and the dark theme. The
  account page also offers the system's theme back, which the toggle does not.
- A signed-in account's toggle is a write, so it tells its outcome in a notification
  ([0022](0022-tell-the-outcome-of-every-write-in-a-notification.md)); a visitor's changes
  nothing on the server and tells nothing.

## Alternatives

- **The browser alone, for everyone.** No server change, but the choice would not follow the
  account to another device, nor between the panel and the portal, which sit on different origins.
- **An account with no choice falling back to the browser's.** The team set the system's theme for
  an account with none; a signed-in screen then depends on the account alone.
- **Keeping the account's theme in the browser too**, to show it before `GET /me` answers. It would
  outlive the account's sign-out in the browser, which the frontends do not allow.
- **A toggle of three states**, light, dark and the system's. One press would no longer flip what
  is on screen; the system's theme stays on the account page.
- **Not keeping a visitor's choice.** The toggle would forget it on every load.

## Consequences

- `accounts` carries the theme, an enum with no default, and `opos_app` updates that column alone
  besides the names and the language.
- Until `GET /me` answers, the visitor's choice or the system's theme is shown: an account whose
  theme differs sees it change once the account is known.
- Every toggle of a signed-in account shows a notification.
- The dark look is shadcn/ui's default dark set until the designer's tokens replace both.
