# 0092. Show Polish until a language is chosen

- Status: Proposed
- Date: 2026-11-25

## Context

The interface speaks Polish, the default, and English
([0011](0011-localize-with-lingui-and-return-codes-from-the-api.md)). The panel, the portal and the
admin application took the account's language, else the first supported language the browser
asked for, else Polish. A visitor with no account had no way to choose: the browser's languages
decided alone. The platform serves Polish conventions first, and a browser set to English, as many
are, put their visitors and organizers in English without asking them. A signed-in account already
keeps its theme on the account and a visitor's theme stays in the browser
([0025](0025-keep-the-theme-on-the-account-and-a-visitors-in-the-browser.md)).

## Decision

- The interface is in Polish until a language is chosen. The browser's languages are never read.
- A signed-in account keeps its language on the account, on every device; with none chosen, it is
  Polish. A visitor's choice stays in the browser, one per application, until an account is signed
  in; when the session ends, the visitor's choice comes back.
- Every screen of the three applications offers a language switcher beside the theme toggle,
  signed in or not: it saves on the account when one is signed in, else in the browser. The
  account page keeps its choice of a language, with no "the browser's language" among them.
- The frontends send the language on screen to the API as `Accept-Language`, so what the API
  renders for a request follows the interface. An account made by signing up takes the language
  its sign-up was made in.

## Alternatives

- **Keep the browser's language as the fallback.** It is the common default of web applications,
  but it shows English to Polish visitors whose browser happens to ask for it, and the product
  speaks to Polish conventions first.
- **Polish for everyone, a choice only on the account.** No visitor could read a convention's page
  in English before signing up, and the forms of sign-up and sign-in would stay Polish for a
  visitor who reads none.
- **A visitor's choice carried onto an account with no language at sign-in.** It writes the account
  without its holder asking; the switcher on every screen saves the choice in one step instead.

## Consequences

- A new visitor sees Polish whatever the browser asks for, and the first visit of a visitor from
  abroad needs one choice in the header.
- A visitor who chose English and signs in to an account with no language sees Polish until the
  account chooses, as a visitor's theme does not carry onto an account either.
- The e2e scenarios, written in the English source messages, choose English for every visitor and
  every account they make; a scenario of the default turns that off.
