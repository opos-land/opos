# Module: `website`

## 1. What it does

Every convention gets a public website at its own address without anyone writing HTML: colours and
a logo at the brand level, per-edition content, news and as many custom pages as the organizers
need. The site is rendered by [`apps/cms`](../PLAN.md#10-appscms) and always shows the active
edition, with previous ones in the archive.

The address exists from the moment the convention does, and it survives every edition — it is the
convention's public identity, and inbound links and search results depend on it staying put.

In the MVP: home page, programme and archive, rendered from the edition, its content and branding
colours.
Custom pages, news and a logo follow; a logo waits for platform-wide file uploads.

## 2. Terms

| Term | Meaning |
|---|---|
| **branding** | logo, colours and fonts, shared by every edition of a convention |
| **edition content** | the hero and the introduction shown for one edition |
| **page** | a custom page with its own address in the site's navigation |
| **news post** | a dated entry on the edition's news list |

## 3. Flows

| Actor | Action | Effect |
|---|---|---|
| org, tenant `branding=write` | sets colours and the logo | every edition's site changes at once, archive included |
| org, `write` | edits the hero and the introduction | the edition's home page changes |
| org, `write` | adds a page | the page joins the navigation once published |
| org, `write` | publishes a news post | it appears at the top of the news list, dated |
| org, `write` | copies content from the previous edition | pages and the hero are duplicated into the new edition as unpublished drafts |
| org, `read` | opens the site section | sees the content and the page list, without a save button |
| visitor | opens the convention address | sees the active published edition; with no such edition, a "preparations under way" page and a link to the archive |

The home page answers the two questions a visitor arrives with — when and where. The dates and the
venue belong to the edition itself, not to this module
([PRODUCT.md 4](../PRODUCT.md#4-business-model--tenant-and-edition)): organizers set them once when
they create the edition, the site reads them, and there is no second copy to keep in step.

The navigation is assembled, not configured: published pages in their set order, plus an entry for
every other module that currently has something to show — a programme with published items, a
ticket type on sale, an open call for proposals or for volunteers. A module with nothing in it
contributes no entry and no page, so a convention that only publishes a programme gets a site with
a programme and nothing else.

## 4. Permissions

Resource `website`, edition level, for everything belonging to one edition. Branding sits behind the
tenant-level `branding` resource, which already exists — it outlives editions.

| Level | Allows |
|---|---|
| `read` | edition content, pages and news posts, drafts included |
| `write` | everything in `read`, plus editing content, creating, publishing and deleting pages and news posts, and copying content from another edition |

## 5. Data

**`tenant_branding`** — at most one per tenant.

| Column | Type | Notes |
|---|---|---|
| `tenantId` | uuid | FK cascade; unique |
| `primaryColor`, `accentColor` | text | `#rrggbb`, validated by zod |
| `logoUrl` | text | nullable — an address until file uploads exist |
| `fontFamily` | text | nullable — one of the names allowed in `packages/contract` |

**`edition_content`** — at most one per edition.

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId` | uuid | FK cascade; unique `(editionId)` |
| `heroTitle` | text | nullable, up to 200 characters |
| `heroText` | text | nullable, up to 2000 characters |
| `introduction` | text | nullable, up to 10000 characters, markdown |

**`website_pages`**

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId` | uuid | FK cascade |
| `slug` | text | `^[a-z0-9-]{2,60}$`, reserved: `program`, `archive`, `news`, `tickets` |
| `title` | text | 1-200 characters |
| `body` | text | up to 50000 characters, markdown |
| `metaDescription` | text | nullable, up to 300 characters |
| `position` | integer | navigation order, default `0` |
| `isPublished` | boolean | default `false` |

Unique `(editionId, slug)`. Index `(tenantId, editionId, position)`.

**`news_posts`**

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId` | uuid | FK cascade |
| `slug` | text | `^[a-z0-9-]{2,80}$` |
| `title` | text | 1-200 characters |
| `body` | text | up to 20000 characters, markdown |
| `publishedAt` | timestamptz | nullable — empty means a draft |

Unique `(editionId, slug)`. Index `(tenantId, editionId, publishedAt)`.

All of it is single-language, in the tenant's `defaultLocale`: this is data, not interface
messages, so it does not pass through Lingui
([PLAN.md 6](../PLAN.md#6-localization)).

## 6. API

Panel, JWT + `X-Tenant-Slug`:

| Method | Path | Permission |
|---|---|---|
| GET, PUT | `/tenants/current/branding` | `branding>=read` / `branding=write` |
| GET, PUT | `/editions/:editionId/content` | `website>=read` / `website=write` |
| GET, POST, PATCH, DELETE | `/editions/:editionId/pages[/:pageId]` | `website>=read` / `website=write` |
| GET, POST, PATCH, DELETE | `/editions/:editionId/news[/:postId]` | `website>=read` / `website=write` |
| POST | `/editions/:editionId/content/copy-from/:sourceEditionId` | `website=write` |

Public, unauthenticated, consumed by the CMS — published editions and published content only:

| Method | Path |
|---|---|
| GET | `/public/tenants/:slug/branding` |
| GET | `/public/tenants/:slug/editions/:editionSlug/content` |
| GET | `/public/tenants/:slug/editions/:editionSlug/pages` |
| GET | `/public/tenants/:slug/editions/:editionSlug/pages/:pageSlug` |
| GET | `/public/tenants/:slug/editions/:editionSlug/news` |

Tenant resolution by `Host`, the LRU cache and the `404` on an unknown host belong to the CMS
([PLAN.md 10](../PLAN.md#10-appscms)), not to this module.

## 7. Out of scope

- **A drag-and-drop layout builder.** Pages are markdown in a fixed layout; the arrangement comes
  from branding, not from the editor.
- **Content in more than one language.** One convention, one language
  ([PRODUCT.md 9](../PRODUCT.md#9-languages-markets-and-time-zones)).
- **The dates and the venue.** They are edition data, entered with the edition; the site shows
  them and keeps no copy of its own.
- **Uploading images and logos** — beyond the MVP platform-wide; addresses only for now.
- **Custom CSS, custom JavaScript, embedded scripts.**
- **The programme, ticket sales, submission forms.** The site links to them; they belong to their
  own modules.
