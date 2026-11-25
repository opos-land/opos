import { type I18n, type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { type PublicEdition, type PublicTenant } from '@opos/contract'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@opos/i18n'
import { publicName } from '@opos/i18n/names'
import { joinTitle } from '../shared/lib/title'
import { excerpt, type PageHead } from './html'
import { type Translators } from './i18n'
import { type PublicReads } from './reads'

// What the head of each page of the portal says (docs/ARCHITECTURE.md, Frontends). A page names
// itself here as it does in the tab, with the messages the page itself uses: a route added to the
// router is added here, and routes.router.test.ts fails until it is. A page that shows a stranger
// nothing is added as `unlisted`.

/** What a head is made from: the API's public answers, the messages and the API's own address. */
export interface HeadContext {
  reads: PublicReads
  translators: Translators
  /** The address a browser reaches the API at, which the pictures of a head are served from. */
  apiUrl: string
}

/** The parts of an address that vary, by the names its route gives them. */
type ParamsOf<Path extends string> = Path extends `${string}:${infer Name}/${infer Rest}`
  ? Record<Name, string> & ParamsOf<`/${Rest}`>
  : Path extends `${string}:${infer Name}`
    ? Record<Name, string>
    : Record<never, string>

type Head<Params> = (
  params: Params,
  context: HeadContext,
  path: string,
) => PageHead | Promise<PageHead>

interface Route {
  path: string
  segments: readonly string[]
  head: Head<Record<string, string>>
}

const segmentsOf = (path: string) => {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? [] : trimmed.slice(1).split('/')
}

const route = <Path extends string>(path: Path, head: Head<ParamsOf<Path>>): Route => ({
  path,
  segments: segmentsOf(path),
  head: head as Route['head'],
})

const application = msg`OPOS`
const blurb = msg`OPOS is the platform conventions use for their programme, tickets and attendee sign-ups. It is free for conventions.`

/**
 * The head every page starts from, and the head of any page while the API is out of reach: the
 * portal's name and what the portal is, at the page's own address.
 */
export function plainHead(
  translators: Translators,
  path: string,
  locale: Locale = DEFAULT_LOCALE,
): PageHead {
  const i18n = translators[locale]
  return {
    status: 200,
    locale,
    application: i18n._(application),
    parts: [],
    description: i18n._(blurb),
    path,
    image: null,
    noIndex: false,
  }
}

/**
 * The head of a page that is not there: an address of no route, and whatever the API does not
 * find. It names no address, and a withdrawn, a taken-down and an unknown profile get it alike.
 */
function notThere(translators: Translators): PageHead {
  const head = plainHead(translators, '')
  return {
    ...head,
    status: 404,
    parts: [translators[head.locale]._(msg`Page not found`)],
    path: null,
    noIndex: true,
  }
}

/** A page named as it names itself in the tab, which says of itself what the portal is. */
const titled =
  (title: MessageDescriptor, noIndex = false): Head<Record<never, string>> =>
  (_params, { translators }, path) => {
    const head = plainHead(translators, path)
    return { ...head, parts: [translators[head.locale]._(title)], noIndex }
  }

/**
 * A page that shows a stranger nothing: what an account keeps for itself, a step a link or a code
 * opens, a checkout, an order. It is named as any other, and search engines are asked to leave it
 * out (docs/PRODUCT.md, 6). It is named in the default language with no read of the API, under a
 * convention's address too: only the one who opens it reads its name, in a language the server
 * does not know.
 */
const unlisted = (title: MessageDescriptor) => titled(title, true)

const apiPath = (apiUrl: string, ...parts: string[]) =>
  [apiUrl.replace(/\/+$/, ''), ...parts.map(encodeURIComponent)].join('/')

/**
 * The plain head of a convention's page: in the convention's language, with its logo, in the
 * larger of the sizes it is served in, as the picture a preview shows.
 */
function conventionHead(context: HeadContext, path: string, slug: string, tenant: PublicTenant) {
  const locale = isLocale(tenant.defaultLocale) ? tenant.defaultLocale : DEFAULT_LOCALE
  const logo = tenant.logo && {
    url: apiPath(
      context.apiUrl,
      'public',
      'tenants',
      slug,
      'logo-files',
      tenant.logo.fileId,
      'large',
    ),
    alt: tenant.name,
  }
  return { ...plainHead(context.translators, path, locale), image: logo }
}

const span = (
  locale: Locale,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
  start: string,
  end: string,
) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone }).formatRange(
    new Date(start),
    new Date(end),
  )

/** When an edition takes place, in the convention's time zone, and where, when it has a venue. */
function whenAndWhere(locale: Locale, tenant: PublicTenant, edition: PublicEdition) {
  const venue = [edition.venueName, edition.venueAddress, edition.venueCity].filter(
    (part) => part !== null,
  )
  return joinTitle([
    span(locale, tenant.timezone, { dateStyle: 'medium' }, edition.startsAt, edition.endsAt),
    venue.join(', '),
  ])
}

/** A page of an edition: named by the edition, after what the page itself is, when it is a part. */
const editionPage =
  (name?: MessageDescriptor): Head<{ tenantSlug: string; editionSlug: string }> =>
  async ({ tenantSlug, editionSlug }, context, path) => {
    const [tenant, edition] = await Promise.all([
      context.reads.convention(tenantSlug),
      context.reads.edition(tenantSlug, editionSlug),
    ])
    if (!tenant || !edition) return notThere(context.translators)
    const head = conventionHead(context, path, tenantSlug, tenant)
    const i18n: I18n = context.translators[head.locale]
    return {
      ...head,
      parts: [...(name ? [i18n._(name)] : []), edition.name],
      description: whenAndWhere(head.locale, tenant, edition),
    }
  }

const ROUTES: readonly Route[] = [
  route('/', titled(msg`Fantasy conventions, in one place`)),
  route('/privacy', titled(msg`Privacy policy`)),
  route('/terms', titled(msg`Terms`)),
  route('/register', titled(msg`Create an account`)),
  route('/login', titled(msg`Sign in`)),
  route('/auth/confirm', unlisted(msg`Confirmation link`)),
  route('/auth/mfa', unlisted(msg`Two-factor authentication`)),
  route('/forgot-password', titled(msg`Reset your password`)),
  route('/account', unlisted(msg`Your account`)),
  route('/account/profile', unlisted(msg`Your profile`)),
  // A published profile, by its public name; search engines are asked to leave it out, as the
  // page itself asks them (docs/specs/0016-public-profile.md, P10).
  route('/profiles/:profileId', async ({ profileId }, context, path) => {
    const profile = await context.reads.profile(profileId)
    if (!profile) return notThere(context.translators)
    const head = plainHead(context.translators, path)
    const i18n = context.translators[head.locale]
    const name = publicName(i18n, profile)
    return {
      ...head,
      parts: [name],
      description: profile.description ? excerpt(profile.description) : head.description,
      image: profile.avatar && {
        url: apiPath(context.apiUrl, 'public', 'avatar-files', profile.avatar.fileId, 'large'),
        alt: i18n._(msg`Avatar of ${name}`),
      },
      noIndex: true,
    }
  }),
  // The page names the profile it reports, which takes a read of the API: the head leaves the
  // name out, and is kept out of search engines as the profile is
  route('/profiles/:profileId/report', (_params, { translators }, path) => ({
    ...plainHead(translators, path),
    noIndex: true,
  })),
  route('/schedule', unlisted(msg`My schedule`)),
  route('/conventions/:tenantSlug', async ({ tenantSlug }, context, path) => {
    const tenant = await context.reads.convention(tenantSlug)
    if (!tenant) return notThere(context.translators)
    return { ...conventionHead(context, path, tenantSlug, tenant), parts: [tenant.name] }
  }),
  route('/conventions/:tenantSlug/:editionSlug', editionPage()),
  route('/conventions/:tenantSlug/:editionSlug/program', editionPage(msg`Programme`)),
  route(
    '/conventions/:tenantSlug/:editionSlug/program/:programItemId',
    async ({ tenantSlug, editionSlug, programItemId }, context, path) => {
      const [tenant, edition, item] = await Promise.all([
        context.reads.convention(tenantSlug),
        context.reads.edition(tenantSlug, editionSlug),
        context.reads.programItem(tenantSlug, editionSlug, programItemId),
      ])
      if (!tenant || !edition || !item) return notThere(context.translators)
      const head = conventionHead(context, path, tenantSlug, tenant)
      // The day of the week opens the description, with a capital letter where the language
      // writes it small, as the page shows it
      const when = span(
        head.locale,
        tenant.timezone,
        { dateStyle: 'full', timeStyle: 'short' },
        item.startsAt,
        item.endsAt,
      ).replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase(head.locale))
      return {
        ...head,
        parts: [item.title, edition.name],
        description: joinTitle([
          when,
          item.description ? excerpt(item.description, 160) : undefined,
        ]),
      }
    },
  ),
  // The shop is named with its edition here, which its page's tab is not: a preview that said
  // "Shop" alone would say nothing of whose shop it is
  route('/conventions/:tenantSlug/:editionSlug/shop', editionPage(msg`Shop`)),
  route('/conventions/:tenantSlug/:editionSlug/shop/checkout', unlisted(msg`Checkout`)),
  route('/conventions/:tenantSlug/:editionSlug/shop/result/:orderId', unlisted(msg`Your order`)),
  route('/order', unlisted(msg`Your order`)),
]

/** The addresses the server knows, as the portal's router writes them. */
export const ROUTE_PATHS: readonly string[] = ROUTES.map(({ path }) => path)

function decoded(part: string) {
  try {
    return decodeURIComponent(part)
  } catch {
    return ''
  }
}

function paramsOf(pattern: readonly string[], parts: readonly string[]) {
  if (pattern.length !== parts.length) return null
  const params: Record<string, string> = {}
  for (const [index, segment] of pattern.entries()) {
    const part = parts[index]!
    if (!segment.startsWith(':')) {
      if (segment.toLowerCase() !== part.toLowerCase()) return null
      continue
    }
    const value = decoded(part)
    if (value === '') return null
    params[segment.slice(1)] = value
  }
  return params
}

function find(pathname: string) {
  const parts = segmentsOf(pathname)
  for (const candidate of ROUTES) {
    const params = paramsOf(candidate.segments, parts)
    if (params) return { route: candidate, params }
  }
  return null
}

/**
 * The route of an address and what the address holds, as the portal's router reads it: with or
 * without a slash at the end, the fixed parts in any case, the others decoded. Null for an
 * address of no route, with an empty part or with a broken encoding.
 */
export function matchRoute(pathname: string) {
  const found = find(pathname)
  return found && { path: found.route.path, params: found.params }
}

/**
 * The head of the page at an address. It fails when a read of the API fails: the caller decides
 * what a page gets instead.
 */
export async function pageHead(pathname: string, context: HeadContext): Promise<PageHead> {
  const found = find(pathname)
  if (!found) return notThere(context.translators)
  const path = pathname.replace(/\/+$/, '') || '/'
  return found.route.head(found.params, context, path)
}
