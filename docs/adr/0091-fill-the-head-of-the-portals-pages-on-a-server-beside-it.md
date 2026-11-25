# 0091. Fill the head of the portal's pages on a server beside it

- Status: Proposed
- Date: 2026-11-24

## Context

The portal is a single-page application: every address answers the same document, whose head
holds the title "OPOS" and nothing else, and a page names itself only once its scripts ran
([0029](0029-ship-four-web-applications.md)). A place a link is shared in, a messenger or a
social network, reads the head of the first answer and runs no script, so a link to a convention,
an edition or a programme item shows the same bare title wherever it is pasted. A search engine
sees the same head before it runs anything, and every address answers 200, one nothing is at among
them.

The portal's pages are the portal's own: its layout, its content security policy with no inline
script, the theme a visitor's browser keeps
([0025](0025-keep-the-theme-on-the-account-and-a-visitors-in-the-browser.md)), the language the
browser asks for. The session lives in cookies on the API's own host
([0004](0004-make-the-api-the-only-backend-with-the-session-in-cookies.md)), so nothing that
serves the portal's document ever sees who asks. A deployment serves each frontend from Caddy,
which holds its headers, its basic auth and its built files
([0033](0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md)).

## Decision

- The document of each of the portal's pages is answered with the head of that page: the title the
  page gives itself in the tab, a description, the page's own address, and what the preview of a
  shared link reads. The body stays the portal's plain document, which starts the application as
  before.
- A server beside the portal makes that head: a small Node process of the portal's own code, in a
  container of its own, which the portal's Caddy asks for every address that is no built file.
  Caddy keeps the built files, the headers and the basic auth, and serves the plain document
  whenever that server fails or does not answer.
- The server reads the API's public routes, through the contract, as anyone reads them: no
  session, no cookie, no secret. The head of an address is the same for every visitor.
- A convention's pages carry their head in the convention's language, every other page in the
  default one. No head follows the language a request asks for.
- A page shows the convention's logo, and a published profile its avatar, as the picture of its
  preview.
- Search engines are asked to leave out a published profile, as its page asks them, and every page
  that shows a stranger nothing: what an account keeps for itself, a step of signing in that a
  link or a code opens, a checkout and an order. Those pages are named in the default language
  with no read of the API, under a convention's address too. The pages that let anyone in, to sign
  in, to create an account and to reset a password, stay open to search engines.
- An address of no route, and one whose convention, edition, programme item or profile the API
  does not find, answers 404 with the portal's document, which says so itself.
- An answer of the API serves the heads of a minute. While the API is out of reach, what a
  convention said in the last ten minutes stands in; a profile never stands in. A page whose head
  cannot be made gets the plain one.
- The dev server fills the head through the same code, so a page is named locally and in the e2e
  tests as it will be once deployed.

The rules are in [ARCHITECTURE.md, Frontends](../ARCHITECTURE.md#frontends) and
[PRODUCT.md 6](../PRODUCT.md#6-addresses-and-domains).

## Alternatives

- **The single-page application as it was.** Nothing to build or run, but no shared link says
  what it leads to, which is what the change is for.
- **Rendering whole pages on the server**, with React Router as a framework. It also gives a
  search engine the content and a phone the first screen sooner, but every page must then run on
  the server too: loaders for the public routes, hydration, a nonce in the content security policy
  for the scripts it inlines, the theme of a visitor's browser unknown to the server. A preview
  reads the head alone. The functions that make a head here become the loaders and the meta of
  such routes, should a search engine or the first screen ask for it later.
- **A head for crawlers alone**, picked by their User-Agent, with everyone else served as before.
  Nothing runs for a person's request, but the list of crawlers ages, each one it misses shows a
  bare link, a search engine gains nothing, and what a crawler is answered can no longer be seen
  in a browser.
- **The Node process serving the portal whole**, in place of Caddy. One container, but the built
  files, the security headers and the basic auth would be written a second time, apart from the
  ones the panel and the admin application keep, and a fault in that process would take the portal
  down instead of its heads.
- **The API answering the head.** No process to add, but the API returns data and codes, never a
  document, and the portal's words would move into it.
- **A prerendering service that runs a browser.** No code of ours to write, but a browser to run
  for every address, or a vendor every page goes through.
- **Pages built ahead as static files.** No process at all, but what a page says changes whenever
  an org saves, with no build in between.
- **The head in the language the request asks for.** A crawler asks for none, and an answer would
  then depend on a header as well as on the address.
- **The server passing the visitor's address on to the API**, so that the API's rate limit counts
  each visitor apart. It needs the address handed down through two proxies and trusted at each;
  the answers kept for a minute make the reads few enough without it.

## Consequences

- A deployment runs one more container. It holds no secret, and the portal opens without it, with
  the head it had before.
- What a page is called is written twice: in the page, for the tab, and on the server, for the
  head. Both use the same messages, and a test keeps the server's routes equal to the router's,
  but the two can still drift in what they say. The shop's head already names its edition, which
  the shop's tab does not, and the head of the page that reports a profile leaves out the
  profile's name, which its tab gives.
- A visitor who reads the portal in another language than a head's sees the tab named in the
  head's language until the page names itself. The description and what a preview reads stay in
  the head's language for as long as that page is shown, so whoever reads the head after the
  scripts ran may read two languages in it.
- The tab of a screen that names nothing says the portal's name, where it kept the title the
  document came with: that title is now a page's own.
- A page that shows a stranger nothing asks search engines to leave it out in the head alone, so
  it asks nothing while the server beside the portal is away.
- A route added to the portal's router is added to the server's routes; the build's tests fail
  until it is.
- The server reads the API as one client, so the API's rate limit counts every head together.
  Beyond it, pages get the plain head until the minute passes.
- A change shows in a head up to a minute later, an unpublished edition's up to ten while the API
  is out of reach. A withdrawn or taken-down profile is gone from its head within a minute.
- The portal drops what the server wrote into the head once it shows another page: a browser that
  shares a page reads the address it shares from there.
- An address nothing is at answers 404, where it answered 200.
- The logo is served no larger than a page shows it, as WebP, so a preview shows a small picture
  and a place that reads no WebP shows none. A size and a format for previews are a change of the
  logo's variants ([0042](0042-keep-a-cleaned-master-of-an-image-and-make-its-variants-in-imgproxy.md)),
  not decided here.
- Dev sits behind basic auth, so no place a link is shared in can read its heads: a preview is
  tried locally or in production.
- The dev server answers every page with 200; the status of a page that is not there is tried
  against the built images.
