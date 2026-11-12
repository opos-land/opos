# 0026. Run a tracker in the portal only with the visitor's consent, and none in the panel

- Status: Accepted
- Date: 2026-11-12

## Context

OPOS uses no tracking or advertising cookies; the sign-in cookie and what the applications keep in
the browser (the visitor's theme, the page to return to after sign-in) are strictly necessary or
asked for by the visitor, so no consent is needed for them
([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)). The team expects analytics, an
advertising pixel or other tools later, not yet known. Under the ePrivacy directive, art. 5(3), and
the GDPR, such a tool may store or read anything in the visitor's browser, or send the visitor's
address to a third party, only after a consent as easy to refuse as to give, specific, never
pre-ticked, and withdrawn as easily as given.

The portal is where visitors come from outside, and where such tools would serve a purpose. The
panel shows organizers the data of attendees: their names, sign-ups and orders, which a third-party
script on the page, a recorder of the screen above all, would read.

## Decision

- **A tracker is anything the portal does not strictly need** for what the visitor asked: analytics,
  an advertising pixel, a screen recorder, a third-party embed, a script, stylesheet or font from
  another origin, a cookie or a browser store of such a tool.
- Every tracker is an entry of the portal's tracker list, with its category (analytics or
  marketing), its provider, its purpose and the cookies it leaves. Only the consent feature starts
  one, after the visitor allowed its category, once per page load.
- **The consent banner** offers, on its first view, allowing all, refusing all, equally prominent,
  and choosing per category. It blocks nothing: the portal works the same with every tracker
  refused. The privacy settings, linked from the footer, change the choice at any time; a
  withdrawal removes the tracker's cookies and reloads the page, so nothing of it keeps running.
- **The banner shows only while the list holds a tracker.** With none, the portal shows no banner
  and no link to the settings.
- The choice belongs to the browser, not to an account: it stays across sign-ins and sign-outs. It
  is kept in the browser with the trackers it was asked for and its date. A tracker not in the
  choice, or a choice older than twelve months, asks again; until answered, nothing runs.
- **The panel runs no tracker.** Neither application creates a script or an iframe outside the
  portal's consent feature, and neither loads a script, a stylesheet or a font from another origin;
  a test in each enforces it
  ([ARCHITECTURE.md, Frontends](../ARCHITECTURE.md#frontends)).
- The first tracker is a product decision: it changes PRODUCT.md 10 and the privacy policy, in its
  own decision record, and enters the list in the same change.

## Alternatives

- **A banner shown already, with nothing to consent to.** It asks for a consent the portal does not
  need, teaches visitors to press "allow" and suggests tracking that is not there.
- **A hosted consent platform** (Cookiebot, CookieYes, Didomi). Priced per domain, while the
  conventions' own sites and domains are planned beyond the MVP; a third-party script on every page,
  the thing the banner guards against; its interface outside shadcn/ui and Lingui. The portal loads
  every script through its own code, so holding one back until consent needs no tag scanning. A
  certified platform under the IAB TCF stays required if programmatic advertising (AdSense, Ad
  Manager) is ever shown.
- **An open-source consent library** (vanilla-cookieconsent, Klaro). Its own interface and styles
  beside shadcn/ui, and a script blocker the portal does not need.
- **Consent kept on the server.** A record of each decision as proof of consent needs a table and a
  route, with a spec of their own; whether the proof needs more than the browser's record and this
  mechanism is a question for the legal review of the privacy policy.
- **The gate in the panel too.** Every third-party script there could read attendees' data; the
  panel has no marketing purpose to serve.

## Consequences

- Adding a tracker is an entry in the list, a Lingui purpose with its `pl` translation, the privacy
  policy and PRODUCT.md 10; the banner, the settings, the loading and the withdrawal need no change.
- A tracker loaded by a tag manager would load others out of the list's sight: the list names each
  tool, never a container of them.
- The decision record of the first tracker answers what this one leaves open: proof of consent on
  the server, and the consent of the conventions' own websites beyond the MVP, where the convention
  is a controller of its own trackers.
- A Content Security Policy that names the allowed origins comes with the deployment and makes the
  test's rule hold in the browser too.
