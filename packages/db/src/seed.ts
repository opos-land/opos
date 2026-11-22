import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { and, eq, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import { grantAdmin } from './admins'
import { migrationDb } from './client'
import { demoAvatar, demoChart } from './demo-chart'
import { demoPdf } from './demo-pdf'
import { migrationUrl, reachableUrl } from './migration-url'
import {
  accountAvatars,
  accountFiles,
  accountProfiles,
  accountRecoveryCodes,
  accounts,
  addOns,
  admins,
  editionConsents,
  editionCustomFields,
  editionDocuments,
  editionDocumentVersions,
  editionMemberships,
  editions,
  editionShops,
  merchandiseItems,
  merchandiseOptionAxes,
  merchandiseOptionValues,
  merchandiseSizeCharts,
  merchandiseVariants,
  merchandiseVariantValues,
  orderAccounts,
  orderConsents,
  orderCustomFieldAnswers,
  orderEmails,
  orderLines,
  orderLinks,
  orderQrCodeOrders,
  orderQrCodes,
  orders,
  paymentAttempts,
  paymentProviderAccounts,
  profileReports,
  programItemLikes,
  programItems,
  programItemSpeakers,
  retiredTenantSlugs,
  shopSellers,
  scannerDevices,
  tenantMemberships,
  tenants,
  ticketTypeAddOns,
  ticketTypeMerchandiseItems,
  ticketTypePerks,
  ticketTypePriceTiers,
  ticketTypes,
  ticketTypeSupporterPrices,
  uploadedFiles,
  discountCodeMerchandiseItems,
  discountCodes,
  discountCodeTicketTypes,
} from './schema'
import { open, orderQrCodeOf, providerAccountOf, seal, sealingKey } from './sealed'
import { createTenant, restoreTenant, suspendTenant } from './tenants'
import { totp } from './totp'

// Demo data. Idempotent: every run converges on the same rows.

type Access = 'none' | 'read' | 'write'

interface SeedAccount {
  email: string
  firstName: string
  lastName: string
  /** The nickname of the public name, and where it stands; between the names when left out. */
  nickname?: string
  nameOrder?: 'nickname-middle' | 'nickname-last'
  theme?: 'light' | 'dark'
}

/** The profile of a demo account (docs/specs/0016-public-profile.md, Seed). */
interface SeedProfile {
  email: string
  published?: boolean
  avatar?: boolean
  description?: string
  pronouns?: string
  city?: string
  links?: string[]
  interests?: (typeof accountProfiles.$inferInsert)['interests']
  /** Taken down by an admin, with the reason and the sentence for the account. */
  takenDown?: { reason: 'identity' | 'offensive' | 'spam'; note: string; reviewRequested: boolean }
  /** The reports of the profile, added once: a run that finds a report adds none. */
  reports?: { reason: 'identity' | 'offensive' | 'spam' | 'other'; note?: string; email?: string }[]
}

interface SeedMember {
  email: string
  /** `org` when left out; a head holds no permission of its own and never expires. */
  role?: 'head' | 'org'
  expired?: boolean
  tenant?: { settingsAccess?: Access; brandingAccess?: Access; shopConfigAccess?: Access }
  editions?: Record<
    string,
    { programAccess?: Access; websiteContentAccess?: Access; ticketsAccess?: Access }
  >
}

interface SeedItem {
  title: string
  description?: string
  speakers?: string[]
  likedBy?: string[]
}

type DocumentKind = (typeof editionDocuments.kind.enumValues)[number]

/** A legal document of a demo edition, published once as a PDF of these lines. */
interface SeedDocument {
  kind: DocumentKind
  title: string
  lines: string[]
}

/** A consent of a demo edition, in the order given; it may link the edition's document of a kind. */
interface SeedConsent {
  text: string
  isRequired: boolean
  document?: DocumentKind
}

type AgeBand = 'child' | 'teen' | 'adult'

/** A moment of a demo catalog, in whole days from the run: before it when below zero. */
type Days = number

interface SeedTicketType {
  name: string
  shortDescription: string
  longDescription: string
  capacity?: number
  ageBands: AgeBand[]
  discountsExcluded?: boolean
  /** On sale from 90 days before the run until the edition ends, at these prices in turn. */
  tiers: { amountMinor: number; from: Days; until: Days | 'end' }[]
  supporterPrices?: number[]
  perks: string[]
  /** The add-ons and the items offered with it, by name. */
  addOns?: string[]
  items?: string[]
}

interface SeedAddOn {
  name: string
  description: string
  amountMinor: number
  kind: (typeof addOns.kind.enumValues)[number]
  capacity?: number
  placesLeftThreshold?: number
}

interface SeedMerchandise {
  name: string
  description: string
  amountMinor: number
  perOrderLimit: number
  picturesIllustrative?: boolean
  /** Left out, the item is sold as its one variant, with this stock; null while unlimited. */
  stock?: number | null
  /** Its axes with the labels of their values; `sizeCharts` gives each value a demo chart. */
  axes?: { name: string; values: string[]; sizeCharts?: boolean }[]
  /** The variants that exist, each by one label of each axis, with its stock. */
  variants?: { values: string[]; stock: number | null }[]
}

/** What a demo edition sells (docs/specs/0003-catalog.md). */
interface SeedCatalog {
  ageBands: { teenFromAge: number; adultFromAge: number }
  guardianConsentFormUrl: string
  /** How many days before the edition starts its merchandise stops selling without a limit. */
  preorderEndsDaysBefore: number
  merchOnly: boolean
  salesClosedMessage: string
  /** Where and when merchandise is handed over, as the page of an order says it. */
  pickupInformation: string
  /** When the edition is open, as its reminder tells a buyer. */
  openingHours: string
  /** How many days before the edition its reminder goes out. */
  reminderDaysBefore: number
  customFields: { label: string; isRequired: boolean }[]
  addOns: SeedAddOn[]
  items: SeedMerchandise[]
  ticketTypes: SeedTicketType[]
}

/** A try at paying a demo order at the fake provider. */
interface SeedAttempt {
  status: (typeof paymentAttempts.status.enumValues)[number]
  /** What the provider confirmed of one paid or refused; left out, what the order asked for. */
  paidAmountMinor?: number
  failureReason?: (typeof paymentAttempts.failureReason.enumValues)[number]
}

/**
 * A demo order: what it holds by the names of the catalog, at the prices the catalog has when it
 * is first seeded.
 */
interface SeedOrder {
  /** Its number, by which the seed finds it again. */
  number: string
  status: (typeof orders.status.enumValues)[number]
  /** Left out for a manual order, which an org placed. */
  email?: string
  holderName: string
  ageBand: (typeof orders.ageBand.enumValues)[number] | null
  ticketType?: string
  addOns?: string[]
  /** An item by its name, its variant by its values, and how many. */
  items?: { name: string; values?: string[]; quantity: number }[]
  /** The demo account the order is attached to. */
  account?: string
  attempts?: SeedAttempt[]
  /** The emails it sent, listed as sent: the seed sends nothing. */
  emails?: (typeof orderEmails.kind.enumValues)[number][]
  /** Why an org recorded it in the panel; a complimentary one costs nothing. */
  manualReason?: (typeof orders.manualReason.enumValues)[number]
  note?: string
  /** An org changed its email: the QR code it had before is replaced by the one it has. */
  emailChanged?: boolean
  /** The discount code the buyer entered; its line carries what the code took off. */
  discountCode?: string
  /** The number of the order it was started from with "Buy more", whose QR code it joins. */
  extends?: string
  /**
   * An order link under the token `demo-order-link-<number>`, so that the demo can open the
   * order's page: one that still opens, or one that expired a day ago.
   */
  link?: 'valid' | 'expired'
  placedDaysAgo: number
}

/** A discount code of a demo edition; what it applies to is named as the catalog names it. */
interface SeedDiscountCode {
  code: string
  percent?: number
  amountMinor?: number
  usageLimit?: number
  ticketTypes?: string[]
  items?: string[]
}

/** The shop of a demo edition: what opening asks of the edition, and whether it is open. */
interface SeedEditionShop {
  open: boolean
  faqUrl?: string
  documents: SeedDocument[]
  consents: SeedConsent[]
  /** Left out, the edition sells nothing. */
  catalog?: SeedCatalog
  /** The orders placed of the catalog. */
  orders?: SeedOrder[]
  /** The discount codes of the edition, by what each applies to. */
  discountCodes?: SeedDiscountCode[]
  /** The scanners the edition's head enabled; a phone was paired with each, so none opens. */
  scanners?: { name: string; revoked?: boolean }[]
}

interface SeedEdition {
  slug: string
  name: string
  startsAt: Date
  endsAt: Date
  isActive: boolean
  isPublished: boolean
  /** Where the edition takes place, as its page and the list of editions show it. */
  venueName: string
  venueAddress: string
  venueCity: string
  program: SeedItem[]
  /** Left out, the edition has set nothing of its shop. */
  shop?: SeedEditionShop
}

/** What a demo convention has set of its shop: its seller's details and its provider account. */
interface SeedShop {
  sellerName: string
  sellerAddress: string
  sellerRegistrationNumber: string
  contactEmail: string
  /** The credentials the fake provider takes as ready to sell. */
  credentials: Record<string, string>
}

interface SeedTenant {
  slug: string
  name: string
  defaultLocale: string
  timezone: string
  headEmail: string
  /** Suspended by the admin: off for everyone else, with everything it owns kept. */
  suspended?: boolean
  /** Left out, the convention has set nothing of its shop. */
  shop?: SeedShop
  editions: SeedEdition[]
  team: SeedMember[]
}

const DEV_PASSWORD = 'password123'
/** The language every demo account reads the applications in, whatever its browser asks for. */
const DEMO_LOCALE = 'pl'
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// The active editions start 60 days after the run, so their programme stays in the future.
const upcoming = (days: number) => {
  const start = new Date(Date.now() + 60 * DAY)
  start.setUTCHours(8, 0, 0, 0)
  return { startsAt: start, endsAt: new Date(start.getTime() + days * DAY + 10 * HOUR) }
}

// Four programme items a day, two hours apart, from two hours after the edition starts.
const ITEMS_PER_DAY = 4
const slot = (edition: Pick<SeedEdition, 'startsAt'>, index: number) => {
  const day = Math.floor(index / ITEMS_PER_DAY)
  const hours = 2 + 2 * (index % ITEMS_PER_DAY)
  const startsAt = new Date(edition.startsAt.getTime() + day * DAY + hours * HOUR)
  return { startsAt, endsAt: new Date(startsAt.getTime() + 1.5 * HOUR) }
}

const ACCOUNTS: SeedAccount[] = [
  { email: 'head@convention-a.test', firstName: 'Anna', lastName: 'Nowak' },
  { email: 'program@convention-a.test', firstName: 'Piotr', lastName: 'Lis' },
  { email: 'settings@convention-a.test', firstName: 'Ewa', lastName: 'Wilk' },
  {
    email: 'viewer@convention-a.test',
    firstName: 'Tom',
    lastName: 'Baker',
    theme: 'dark',
  },
  { email: 'expired@convention-a.test', firstName: 'Marek', lastName: 'Sowa' },
  { email: 'gate@convention-a.test', firstName: 'Ola', lastName: 'Kruk' },
  { email: 'head@convention-b.test', firstName: 'Jana', lastName: 'Novak' },
  { email: 'head@convention-c.test', firstName: 'Igor', lastName: 'Bielik' },
  { email: 'speaker@example.com', firstName: 'Kasia', lastName: 'Mazur', nickname: 'Mazurek' },
  {
    email: 'attendee@example.com',
    firstName: 'Jan',
    lastName: 'Kowal',
    nickname: 'Jasiek',
    nameOrder: 'nickname-last',
  },
  { email: 'mfa@example.com', firstName: 'Maria', lastName: 'Zielinska' },
  { email: 'multi@example.com', firstName: 'Olga', lastName: 'Duda' },
]

// The demo of the public profile: one published with every field set and an avatar, which a
// visitor reaches from the programme and which was reported twice; one its account never
// published; and one an admin took down, whose account asks for a review.
const PROFILES: SeedProfile[] = [
  {
    email: 'speaker@example.com',
    published: true,
    avatar: true,
    description: 'Game master and LARP writer.\nRuns one-shots for newcomers at every convention.',
    pronouns: 'she/her',
    city: 'Gdynia',
    links: ['https://example.com/kasia', 'https://example.org/one-shots'],
    interests: ['tabletop-rpg', 'larp', 'literature'],
    reports: [
      {
        reason: 'spam',
        note: 'A demo report that gave an address.',
        email: 'reporter@example.com',
      },
      { reason: 'other' },
    ],
  },
  {
    email: 'attendee@example.com',
    description: 'Board games and fantasy novels.',
    city: 'Krakow',
    interests: ['board-games', 'literature'],
  },
  {
    email: 'multi@example.com',
    description: 'Hand-made dice, shipped anywhere.',
    links: ['https://example.com/dice'],
    takenDown: {
      reason: 'spam',
      note: 'A profile is not a place for advertising.',
      reviewRequested: true,
    },
  },
]

// The accounts with two-factor authentication: a TOTP factor enrolled and verified
// through Supabase Auth, and ten recovery codes of the length the API issues.
const MFA_EMAIL = 'mfa@example.com'
// The admin: two-factor authentication on, as the role needs, and the role granted on that factor.
// On the local stack alone. The demo password and recovery codes are public: on the shared Dev
// anyone could sign in with them, replace the factor and wait for the next run to grant the role
// to the new one. On Dev a person's own account is granted the role with `pnpm db:admin:grant`.
const ADMIN: SeedAccount = { email: 'admin@example.com', firstName: 'Adam', lastName: 'Wrona' }
const SEEDS_ADMIN = process.env.OPOS_ENV === 'local'
const RECOVERY_CODES = Array.from(
  { length: 10 },
  (_, index) => `DEMORECOVERYCOD${'ABCDEFGHIJ'[index]}`,
)

// The text of every demo document says what it is: OPOS ships no legal text of its own.
const demoDocument = (kind: DocumentKind, title: string): SeedDocument => ({
  kind,
  title,
  lines: [
    'This is a demo document of a demo convention.',
    'It stands in for a text the convention writes itself and binds nobody.',
  ],
})

const SIZES = ['S', 'M', 'L', 'XL']

// What the coming edition of convention A sells. The T-shirt has a variant out of stock
// (women's XL) and one that does not exist (men's S).
const DEMO_CATALOG: SeedCatalog = {
  ageBands: { teenFromAge: 13, adultFromAge: 18 },
  guardianConsentFormUrl: 'https://convention-a.test/guardian-consent.pdf',
  preorderEndsDaysBefore: 21,
  merchOnly: true,
  salesClosedMessage: 'Sales are closed for now. See you at the convention.',
  pickupInformation:
    'Pick up your merchandise at the merchandise desk in the main hall, on every day of the convention from 10:00 to 18:00. Show the QR code of your order.',
  openingHours: 'The convention is open on every day from 10:00 to 20:00; the gate opens at 9:30.',
  reminderDaysBefore: 3,
  customFields: [
    { label: 'City you travel from', isRequired: false },
    { label: 'Favourite fandom', isRequired: false },
  ],
  addOns: [
    {
      name: 'Miniature painting workshop',
      description: 'Two hours with a painter, brushes and paints included.',
      amountMinor: 4000,
      kind: 'limited',
      capacity: 40,
      placesLeftThreshold: 10,
    },
    {
      name: 'Sleeping room',
      description: 'A place on the floor of the sleeping room. Bring a mat and a sleeping bag.',
      amountMinor: 0,
      kind: 'headcount',
    },
  ],
  items: [
    {
      name: 'T-shirt',
      description: 'Cotton T-shirt with the print of this edition.',
      amountMinor: 8000,
      perOrderLimit: 5,
      picturesIllustrative: true,
      axes: [
        { name: 'Cut', values: ["Women's", "Men's"], sizeCharts: true },
        { name: 'Size', values: SIZES },
      ],
      variants: [
        ...SIZES.map((size) => ({ values: ["Women's", size], stock: size === 'XL' ? 0 : null })),
        ...SIZES.slice(1).map((size) => ({ values: ["Men's", size], stock: null })),
      ],
    },
    {
      name: 'Enamel pin',
      description: 'Hard enamel pin, 3 cm.',
      amountMinor: 1500,
      perOrderLimit: 10,
      stock: 200,
    },
  ],
  ticketTypes: [
    {
      name: 'Standard',
      shortDescription: 'All three days of the convention.',
      longDescription: 'Entry to every programme item, the games room and the exhibitors.',
      capacity: 800,
      ageBands: ['child', 'teen', 'adult'],
      tiers: [
        { amountMinor: 12000, from: -90, until: 14 },
        { amountMinor: 15000, from: 14, until: 'end' },
      ],
      supporterPrices: [20000, 30000],
      perks: ['A badge with your name'],
      addOns: ['Miniature painting workshop', 'Sleeping room'],
      items: ['T-shirt', 'Enamel pin'],
    },
    {
      name: 'Supporter',
      shortDescription: 'All three days, and your name among the supporters.',
      longDescription: 'Everything the standard one gives, with the supporter perks.',
      capacity: 100,
      ageBands: ['adult'],
      discountsExcluded: true,
      tiers: [{ amountMinor: 40000, from: -90, until: 'end' }],
      perks: ['A badge with your name', 'A supporter pin', 'Your name in the programme book'],
      addOns: ['Sleeping room'],
      items: ['T-shirt', 'Enamel pin'],
    },
  ],
}

// An order in each status (docs/specs/0004-checkout-and-orders.md, Seed): among them one with a
// teen as its ticket holder, one of merchandise alone, one attached to a demo account, and a
// payment an order no longer needed. Their numbers use no character mistaken for another.
const DEMO_ORDERS: SeedOrder[] = [
  {
    number: 'DEMPAYWAT2',
    status: 'awaiting-payment',
    email: 'waiting@example.com',
    holderName: 'Demo Waiting',
    ageBand: 'adult',
    ticketType: 'Standard',
    attempts: [{ status: 'started' }],
    placedDaysAgo: 0,
  },
  {
    number: 'DEMPAD2222',
    status: 'paid',
    email: 'attendee@example.com',
    holderName: 'Jan Kowal',
    ageBand: 'adult',
    ticketType: 'Standard',
    addOns: ['Miniature painting workshop', 'Sleeping room'],
    items: [
      { name: 'T-shirt', values: ["Men's", 'M'], quantity: 1 },
      { name: 'Enamel pin', quantity: 2 },
    ],
    account: 'attendee@example.com',
    // Paid twice: the second payment was one the order no longer needed, and was refused.
    attempts: [{ status: 'paid' }, { status: 'refused' }],
    emails: ['order-confirmation', 'payment-not-needed'],
    link: 'valid',
    placedDaysAgo: 6,
  },
  // What the demo account bought later with "Buy more" (docs/specs/0009-buyer-self-service.md,
  // Seed): an order of its own, on the QR code of the first.
  {
    number: 'DEMEXTEND2',
    status: 'paid',
    email: 'attendee@example.com',
    holderName: 'Jan Kowal',
    ageBand: null,
    items: [{ name: 'Enamel pin', quantity: 1 }],
    account: 'attendee@example.com',
    extends: 'DEMPAD2222',
    attempts: [{ status: 'paid' }],
    emails: ['order-confirmation'],
    placedDaysAgo: 2,
  },
  {
    number: 'DEMTEEN222',
    status: 'paid',
    email: 'guardian@example.com',
    holderName: 'Demo Teen',
    ageBand: 'teen',
    ticketType: 'Standard',
    attempts: [{ status: 'failed', failureReason: 'wrong-code' }, { status: 'paid' }],
    emails: ['order-confirmation'],
    link: 'expired',
    placedDaysAgo: 5,
  },
  {
    number: 'DEMMERCH22',
    status: 'paid',
    email: 'merch@example.com',
    holderName: 'Demo Merch',
    ageBand: null,
    items: [{ name: 'Enamel pin', quantity: 3 }],
    attempts: [{ status: 'paid' }],
    emails: ['order-confirmation'],
    placedDaysAgo: 4,
  },
  // Orders that used a discount code (docs/specs/0008-discount-codes.md, Seed): a guest who came
  // in for nothing, and the one buyer a code of one use was for.
  {
    number: 'DEMGUEST22',
    status: 'paid',
    email: 'guest@example.com',
    holderName: 'Demo Guest of Honour',
    ageBand: 'adult',
    ticketType: 'Standard',
    discountCode: 'guest100',
    emails: ['order-confirmation'],
    placedDaysAgo: 6,
  },
  {
    number: 'DEMFAN2222',
    status: 'paid',
    email: 'first-fan@example.com',
    holderName: 'Demo First Fan',
    ageBand: 'adult',
    ticketType: 'Standard',
    attempts: [{ status: 'paid' }],
    discountCode: 'firstfan',
    emails: ['order-confirmation'],
    placedDaysAgo: 9,
  },
  // A manual order of each reason (docs/specs/0006-order-management.md, Seed).
  {
    number: 'DEMMANUA22',
    status: 'paid-manual',
    holderName: 'Demo Guest',
    ageBand: 'adult',
    ticketType: 'Standard',
    manualReason: 'desk',
    note: 'Paid in cash at the desk.',
    placedDaysAgo: 3,
  },
  {
    number: 'DEMNVCE222',
    status: 'paid-manual',
    holderName: 'Demo Company',
    ageBand: 'adult',
    ticketType: 'Standard',
    items: [{ name: 'Enamel pin', quantity: 5 }],
    manualReason: 'invoice',
    note: 'Invoice 7/2026.',
    placedDaysAgo: 2,
  },
  {
    number: 'DEMCMPMT22',
    status: 'paid-manual',
    holderName: 'Demo Volunteer',
    ageBand: 'adult',
    ticketType: 'Standard',
    manualReason: 'complimentary',
    placedDaysAgo: 2,
  },
  // A paid order whose email an org changed: it carries a new QR code, and the old one is kept
  // as replaced.
  {
    number: 'DEMCHANGE2',
    status: 'paid',
    email: 'new-address@example.com',
    holderName: 'Demo Changed',
    ageBand: 'adult',
    ticketType: 'Standard',
    attempts: [{ status: 'paid' }],
    emails: ['order-confirmation', 'order-email-changed'],
    emailChanged: true,
    placedDaysAgo: 7,
  },
  {
    number: 'DEMEXPRD22',
    status: 'expired',
    email: 'late@example.com',
    holderName: 'Demo Late',
    ageBand: 'adult',
    ticketType: 'Standard',
    attempts: [{ status: 'failed', failureReason: 'canceled' }],
    emails: ['order-expired'],
    placedDaysAgo: 3,
  },
  {
    number: 'DEMREVEW22',
    status: 'needs-review',
    email: 'review@example.com',
    holderName: 'Demo Review',
    ageBand: 'adult',
    ticketType: 'Standard',
    addOns: ['Sleeping room'],
    attempts: [{ status: 'paid', paidAmountMinor: 10000 }],
    emails: ['payment-under-review'],
    placedDaysAgo: 2,
  },
  {
    number: 'DEMDECNE22',
    status: 'declined',
    email: 'declined@example.com',
    holderName: 'Demo Declined',
    ageBand: 'adult',
    ticketType: 'Standard',
    attempts: [{ status: 'paid', paidAmountMinor: 100 }],
    emails: ['payment-under-review'],
    placedDaysAgo: 8,
  },
  {
    number: 'DEMCANCE22',
    status: 'canceled',
    email: 'canceled@example.com',
    holderName: 'Demo Canceled',
    ageBand: 'adult',
    ticketType: 'Supporter',
    attempts: [{ status: 'paid' }],
    emails: ['order-confirmation'],
    placedDaysAgo: 9,
  },
]

const TENANTS: SeedTenant[] = [
  {
    slug: 'convention-a',
    name: 'Convention A',
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
    headEmail: 'head@convention-a.test',
    // Ready to sell: the seller's details complete, and an account of the fake provider.
    shop: {
      sellerName: 'Convention A Foundation',
      sellerAddress: 'ul. Przykładowa 1, 61-001 Poznań',
      sellerRegistrationNumber: 'KRS 0000000000',
      contactEmail: 'shop@convention-a.test',
      credentials: { account: 'demo' },
    },
    editions: [
      {
        slug: '2025',
        name: 'Convention A 2025',
        startsAt: new Date('2025-06-13T08:00:00Z'),
        endsAt: new Date('2025-06-15T18:00:00Z'),
        isActive: false,
        isPublished: true,
        venueName: 'Old Brewery Hall',
        venueAddress: 'ul. Przykładowa 12',
        venueCity: 'Poznań',
        program: [
          { title: 'Opening ceremony' },
          {
            title: 'Worldbuilding from scratch',
            description: 'Geography, history and belief, in the order a new world needs them.',
            speakers: ['speaker@example.com'],
          },
          { title: 'A history of tabletop role-playing' },
          { title: 'Costume armour workshop' },
          {
            title: 'Writing villains people remember',
            description: 'What a good antagonist wants, and why the reader half agrees.',
            speakers: ['speaker@example.com'],
          },
          { title: 'Board game design clinic' },
          { title: 'Folklore in modern fantasy' },
          { title: 'Closing ceremony' },
        ],
        // Closed, and not ready to open: it has its shop terms and no privacy policy.
        shop: {
          open: false,
          documents: [demoDocument('shop-terms', 'Shop terms 2025')],
          consents: [],
        },
      },
      {
        slug: '2026',
        name: 'Convention A 2026',
        ...upcoming(2),
        isActive: true,
        isPublished: true,
        venueName: 'Exhibition Grounds, Hall 3',
        venueAddress: 'ul. Przykładowa 40',
        venueCity: 'Poznań',
        program: [
          { title: 'Opening ceremony' },
          {
            title: 'Maps for imaginary worlds',
            description: 'Coastlines, rivers and borders that look as if they grew there.',
            likedBy: ['attendee@example.com'],
          },
          { title: 'Running your first campaign', likedBy: ['attendee@example.com'] },
          { title: 'Prop making on a budget' },
          { title: 'Magic systems that hold together', likedBy: ['attendee@example.com'] },
          { title: 'Miniature painting basics' },
          { title: 'Dragons across cultures' },
          { title: 'Live action role-play safety' },
          { title: 'Translating fantasy fiction' },
          { title: 'Speed painting contest' },
          { title: 'An evening of fantasy music' },
          { title: 'Closing ceremony' },
        ],
        // Open: every condition of opening holds.
        shop: {
          open: true,
          faqUrl: 'https://convention-a.test/faq',
          documents: [
            demoDocument('shop-terms', 'Shop terms'),
            demoDocument('privacy-policy', 'Privacy policy'),
            demoDocument('edition-rules', 'Convention rules'),
          ],
          consents: [
            { text: 'I accept the shop terms.', isRequired: true, document: 'shop-terms' },
            {
              text: 'I have read the privacy policy.',
              isRequired: true,
              document: 'privacy-policy',
            },
            { text: 'I want to receive news of the convention by email.', isRequired: false },
          ],
          catalog: DEMO_CATALOG,
          discountCodes: [
            { code: 'early10', percent: 10, ticketTypes: ['Standard'] },
            { code: 'merch20', amountMinor: 2000, items: ['T-shirt'] },
            { code: 'guest100', percent: 100, ticketTypes: ['Standard'] },
            { code: 'firstfan', percent: 15, usageLimit: 1, ticketTypes: ['Standard'] },
          ],
          orders: DEMO_ORDERS,
          scanners: [{ name: 'Main gate' }, { name: 'Merchandise desk', revoked: true }],
        },
      },
    ],
    team: [
      { email: 'program@convention-a.test', editions: { '2026': { programAccess: 'write' } } },
      { email: 'settings@convention-a.test', tenant: { settingsAccess: 'write' } },
      {
        email: 'viewer@convention-a.test',
        tenant: { settingsAccess: 'read' },
        editions: { '2026': { programAccess: 'read' } },
      },
      {
        email: 'expired@convention-a.test',
        expired: true,
        tenant: { settingsAccess: 'write' },
        editions: { '2026': { programAccess: 'write' } },
      },
      { email: 'gate@convention-a.test', editions: { '2026': { ticketsAccess: 'write' } } },
      { email: 'multi@example.com', role: 'head' },
    ],
  },
  {
    slug: 'convention-b',
    name: 'Convention B',
    defaultLocale: 'en',
    timezone: 'Europe/Prague',
    headEmail: 'head@convention-b.test',
    editions: [
      {
        slug: '2026',
        name: 'Convention B 2026',
        ...upcoming(1),
        isActive: true,
        isPublished: true,
        venueName: 'Riverside Community Centre',
        venueAddress: 'Vzorová 7',
        venueCity: 'Praha',
        program: [
          { title: 'Welcome talk' },
          { title: 'An introduction to live role-play' },
          { title: 'Fantasy cartography' },
          { title: 'Closing panel' },
        ],
      },
    ],
    team: [{ email: 'multi@example.com', role: 'head' }],
  },
  {
    slug: 'convention-c',
    name: 'Convention C',
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
    headEmail: 'head@convention-c.test',
    suspended: true,
    editions: [
      {
        slug: '2026',
        name: 'Convention C 2026',
        ...upcoming(1),
        isActive: true,
        isPublished: true,
        venueName: 'Student Union',
        venueAddress: 'ul. Przykładowa 3',
        venueCity: 'Wrocław',
        program: [
          { title: 'Welcome talk' },
          { title: 'Heraldry for invented kingdoms', likedBy: ['attendee@example.com'] },
          { title: 'Closing panel' },
        ],
      },
    ],
    team: [],
  },
]

if (process.env.OPOS_ENV !== 'local' && process.env.OPOS_ENV !== 'dev') {
  console.error('The seed runs where OPOS_ENV is local or dev.')
  process.exit(1)
}

function required(name: string) {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} is not set; run pnpm infra:init`)
    process.exit(1)
  }
  return value
}

// The Auth URL follows the rule of the database URL: a host off the loopback interface needs
// OPOS_ENV dev, so a remote Auth next to a local database gets no account.
let supabaseUrl: string
try {
  supabaseUrl = reachableUrl('SUPABASE_URL', required('SUPABASE_URL'))
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
const authUrl = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`
const secretKey = required('SUPABASE_SECRET_KEY')

const db = migrationDb(migrationUrl())

// The key the API opens a provider account's credentials with seals the demo account's.
const credentialsKey = sealingKey(required('PAYMENT_CREDENTIALS_KEY'))

// The bucket the API reads holds the demo documents. Its address follows the rule of the database
// URL too: a bucket off the loopback interface needs OPOS_ENV dev.
const s3 = {
  endpoint: required('S3_ENDPOINT'),
  region: required('S3_REGION'),
  bucket: required('S3_BUCKET'),
  accessKeyId: required('S3_ACCESS_KEY_ID'),
  secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
}
try {
  reachableUrl('S3_ENDPOINT', s3.endpoint)
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
const bucket = new S3Client({
  endpoint: s3.endpoint,
  region: s3.region,
  credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
  forcePathStyle: true,
  // An S3-compatible bucket takes the checksums S3 itself asks for, and no others.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

/** The kind the API's storage keeps a version of a legal document as. */
const DOCUMENT_FILE_KIND = 'edition-document'
/** The kind the API declares for the size chart of a value of a merchandise item. */
const SIZE_CHART_FILE_KIND = 'merchandise-size-chart'
/** The sizes the API makes of a size chart's master, each an object beside it. */
const CHART_SIZES = ['small', 'large']
/** The kind the API declares for an account's avatar, the label it keeps one under, and its sizes. */
const AVATAR_FILE_KIND = 'profile-avatar'
const AVATAR_LABEL = 'avatar'
const AVATAR_SIZES = ['large', 'small']

/**
 * Where the API's storage reads an edition's file that is no image: under its tenant and the
 * file, as `file` (apps/api/src/modules/files/owners.ts). An API test reads a seeded document
 * through the public route, so a change of the layout there fails it.
 */
const fileObjectKey = (tenantId: string, fileId: string) => `tenants/${tenantId}/${fileId}/file`

/** The object of the master of an edition's image, as the API's storage reads it. */
const masterObjectKey = (tenantId: string, fileId: string) => `tenants/${tenantId}/${fileId}/master`

/** An object the bucket gets once the rows that point at it are committed. */
interface PendingObject {
  key: string
  bytes: Buffer
  type: string
  /** Objects made of what this one replaces, which go once it is put. */
  stale?: string[]
}

/** A call to Supabase Auth, authorized by the secret key alone, or by a session on top of it. */
async function authCall<T = object>(
  method: string,
  path: string,
  body?: object,
  accessToken?: string,
) {
  const response = await fetch(`${authUrl}${path}`, {
    method,
    headers: {
      apikey: secretKey,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`)
  }
  return (await response.json().catch(() => ({}))) as T
}

/** The Supabase Auth admin API. */
const authAdmin = <T = object>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: object,
) => authCall<T>(method, path, body)

async function ensureAccount(account: SeedAccount) {
  const [existing] = await db
    .select({ id: accounts.id, emailConfirmedAt: accounts.emailConfirmedAt })
    .from(accounts)
    .where(eq(accounts.email, account.email))
  // Every seed account is confirmed: createTenant and the invitations count no other.
  if (!existing) {
    await authAdmin('POST', '/admin/users', {
      email: account.email,
      password: DEV_PASSWORD,
      email_confirm: true,
    })
  } else if (!existing.emailConfirmedAt) {
    await authAdmin('PUT', `/admin/users/${existing.id}`, { email_confirm: true })
  }
  // The auth.users trigger created the row; the seed owns the names, the locale and the theme.
  await db
    .update(accounts)
    .set({
      firstName: account.firstName,
      lastName: account.lastName,
      nickname: account.nickname ?? null,
      nameOrder: account.nameOrder ?? 'nickname-middle',
      locale: DEMO_LOCALE,
      theme: account.theme ?? null,
    })
    .where(eq(accounts.email, account.email))
}

/**
 * Gives the account a verified TOTP factor and ten unused recovery codes. The factor is enrolled
 * and verified through Supabase Auth as a person would, so its trigger sets `mfaEnabledAt`; a
 * verified factor is kept, so a rerun enrolls nothing.
 */
async function ensureTwoFactor(email: string) {
  const id = await accountId(email)
  const { factors: held = [] } = await authAdmin<{ factors?: { id: string; status: string }[] }>(
    'GET',
    `/admin/users/${id}`,
  )
  for (const factor of held.filter((factor) => factor.status !== 'verified')) {
    await authAdmin('DELETE', `/admin/users/${id}/factors/${factor.id}`)
  }
  if (!held.some((factor) => factor.status === 'verified')) {
    // Enrolling signs in with the dev password, which the person may have changed since; it is
    // set only here, so a rerun that finds the factor leaves the password alone.
    await authAdmin('PUT', `/admin/users/${id}`, { password: DEV_PASSWORD })
    await enrollFactor(email)
  }

  const hashes = RECOVERY_CODES.map((code) => createHash('sha256').update(code).digest('hex'))
  await db.transaction(async (tx) => {
    await tx
      .delete(accountRecoveryCodes)
      .where(
        and(
          eq(accountRecoveryCodes.accountId, id),
          notInArray(accountRecoveryCodes.codeHash, hashes),
        ),
      )
    for (const codeHash of hashes) {
      await tx
        .insert(accountRecoveryCodes)
        .values({ accountId: id, codeHash })
        .onConflictDoUpdate({
          target: [accountRecoveryCodes.accountId, accountRecoveryCodes.codeHash],
          set: { usedAt: null },
        })
    }
  })
}

/** Signs in with the dev password, enrolls a TOTP factor and verifies it with its own code. */
async function enrollFactor(email: string) {
  const session = await authCall<{ access_token: string }>('POST', '/token?grant_type=password', {
    email,
    password: DEV_PASSWORD,
  })
  const token = session.access_token
  const factor = await authCall<{ id: string; totp: { secret: string } }>(
    'POST',
    '/factors',
    { factor_type: 'totp', friendly_name: 'Authenticator' },
    token,
  )
  const secret = factor.totp.secret
  const challenge = await authCall<{ id: string }>(
    'POST',
    `/factors/${factor.id}/challenge`,
    {},
    token,
  )
  await authCall(
    'POST',
    `/factors/${factor.id}/verify`,
    { challenge_id: challenge.id, code: totp(secret, Date.now()) },
    token,
  )
  // The output of a local run stays on the developer's machine; on Dev it lands in the deploy log.
  if (process.env.OPOS_ENV === 'local') console.log(`${email} TOTP secret: ${secret}`)
}

/**
 * Grants the account the admin role unless a grant of its present factor stands, so a rerun
 * leaves no second entry in the log and a replaced factor gets a new grant.
 */
async function ensureAdmin(email: string) {
  const [grant] = await db
    .select({ stands: sql<boolean>`${admins.mfaEnabledAt} = ${accounts.mfaEnabledAt}` })
    .from(admins)
    .innerJoin(accounts, eq(accounts.id, admins.accountId))
    .where(eq(accounts.email, email))
  if (!grant?.stands) await grantAdmin(db, email)
}

async function accountId(email: string) {
  const [row] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email))
  if (!row) throw new Error(`Seed account ${email} is missing`)
  return row.id
}

async function seedTenant(spec: SeedTenant) {
  // The seed owns the slugs of its tenants: one an admin deleted is retired for good, and freed
  // here, so the demo tenant returns.
  await db.delete(retiredTenantSlugs).where(eq(retiredTenantSlugs.slug, spec.slug))
  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, spec.slug))
  const tenantId = existing
    ? existing.id
    : (
        await createTenant(db, {
          slug: spec.slug,
          name: spec.name,
          headEmail: spec.headEmail,
          defaultLocale: spec.defaultLocale,
          timezone: spec.timezone,
        })
      ).id

  const headId = await accountId(spec.headEmail)
  const team = await Promise.all(
    spec.team.map(async (member) => ({ ...member, id: await accountId(member.email) })),
  )
  const itemAccounts = new Set(
    spec.editions.flatMap(({ program }) =>
      program.flatMap(({ speakers = [], likedBy = [] }) => [...speakers, ...likedBy]),
    ),
  )
  const accountIds = new Map(
    await Promise.all(
      [...itemAccounts].map(async (email) => [email, await accountId(email)] as const),
    ),
  )

  const objects: PendingObject[] = []
  await db.transaction(async (tx) => {
    await tx
      .update(tenants)
      .set({ name: spec.name, defaultLocale: spec.defaultLocale, timezone: spec.timezone })
      .where(eq(tenants.id, tenantId))

    // Inactive editions first: the partial unique index allows one active edition at a time.
    const editionIds = new Map<string, string>()
    for (const { program, ...edition } of [...spec.editions].sort(
      (a, b) => +a.isActive - +b.isActive,
    )) {
      const [row] = await tx
        .insert(editions)
        .values({ tenantId, ...edition })
        .onConflictDoUpdate({
          target: [editions.tenantId, editions.slug],
          set: {
            name: edition.name,
            startsAt: edition.startsAt,
            endsAt: edition.endsAt,
            isActive: edition.isActive,
            isPublished: edition.isPublished,
            venueName: edition.venueName,
            venueAddress: edition.venueAddress,
            venueCity: edition.venueCity,
          },
        })
        .returning({ id: editions.id })
      const editionId = row!.id
      editionIds.set(edition.slug, editionId)

      // A programme item has no natural key: its title identifies it within a seeded edition.
      for (const [index, item] of program.entries()) {
        const values = {
          title: item.title,
          description: item.description ?? null,
          ...slot(edition, index),
        }
        const [existing] = await tx
          .select({ id: programItems.id })
          .from(programItems)
          .where(and(eq(programItems.editionId, editionId), eq(programItems.title, item.title)))
        const [saved] = existing
          ? await tx
              .update(programItems)
              .set(values)
              .where(eq(programItems.id, existing.id))
              .returning({ id: programItems.id })
          : await tx
              .insert(programItems)
              .values({ tenantId, editionId, ...values })
              .returning({ id: programItems.id })
        const onItem = (email: string) => ({
          tenantId,
          programItemId: saved!.id,
          accountId: accountIds.get(email)!,
        })
        for (const email of item.speakers ?? []) {
          await tx.insert(programItemSpeakers).values(onItem(email)).onConflictDoNothing()
        }
        for (const email of item.likedBy ?? []) {
          await tx.insert(programItemLikes).values(onItem(email)).onConflictDoNothing()
        }
      }
    }

    if (spec.shop) await seedShop(tx, tenantId, spec.shop)
    for (const edition of spec.editions) {
      if (!edition.shop) continue
      const editionId = editionIds.get(edition.slug)!
      objects.push(...(await seedEditionShop(tx, tenantId, editionId, edition.shop)))
      if (edition.shop.catalog) {
        objects.push(...(await seedCatalog(tx, tenantId, editionId, edition, edition.shop.catalog)))
      }
      for (const code of edition.shop.discountCodes ?? []) {
        await seedDiscountCode(tx, tenantId, editionId, code)
      }
      for (const order of edition.shop.orders ?? []) {
        await seedOrder(tx, { tenantId, editionId, conventionName: spec.name }, order)
      }
    }

    // A head holds no permission of its own and never expires.
    const asHead = (id: string) => ({
      id,
      role: 'head' as const,
      expiresAt: null,
      tenant: {} as NonNullable<SeedMember['tenant']>,
      editions: {} as NonNullable<SeedMember['editions']>,
    })
    let headMembershipId: string | undefined
    const members = [
      asHead(headId),
      ...team.map((member) =>
        member.role === 'head'
          ? asHead(member.id)
          : {
              id: member.id,
              role: 'org' as const,
              expiresAt: member.expired ? new Date(Date.now() - DAY) : null,
              tenant: member.tenant ?? {},
              editions: member.editions ?? {},
            },
      ),
    ]
    for (const member of members) {
      const access = {
        role: member.role,
        settingsAccess: member.tenant.settingsAccess ?? 'none',
        brandingAccess: member.tenant.brandingAccess ?? 'none',
        shopConfigAccess: member.tenant.shopConfigAccess ?? 'none',
        expiresAt: member.expiresAt,
      }
      const [membership] = await tx
        .insert(tenantMemberships)
        .values({ accountId: member.id, tenantId, ...access })
        .onConflictDoUpdate({
          target: [tenantMemberships.accountId, tenantMemberships.tenantId],
          set: access,
        })
        .returning({ id: tenantMemberships.id })
      if (member.id === headId) headMembershipId = membership!.id

      for (const [slug, permissions] of Object.entries(member.editions)) {
        const editionAccess = {
          programAccess: permissions.programAccess ?? 'none',
          websiteContentAccess: permissions.websiteContentAccess ?? 'none',
          ticketsAccess: permissions.ticketsAccess ?? 'none',
        }
        await tx
          .insert(editionMemberships)
          .values({
            tenantId,
            tenantMembershipId: membership!.id,
            editionId: editionIds.get(slug)!,
            ...editionAccess,
          })
          .onConflictDoUpdate({
            target: [editionMemberships.tenantMembershipId, editionMemberships.editionId],
            set: editionAccess,
          })
      }
    }

    // The scanners of an edition (docs/specs/0007-scanner.md, Seed), enabled by the head. A
    // phone was paired with each long ago, under a code and a token nobody holds: the seed opens
    // no device.
    for (const edition of spec.editions) {
      const editionId = editionIds.get(edition.slug)!
      for (const scanner of edition.shop?.scanners ?? []) {
        const [existing] = await tx
          .select({ id: scannerDevices.id })
          .from(scannerDevices)
          .where(
            and(eq(scannerDevices.editionId, editionId), eq(scannerDevices.name, scanner.name)),
          )
        if (existing) continue
        const secret = () => createHash('sha256').update(randomBytes(32)).digest('hex')
        const pairedAt = new Date(Date.now() - 7 * DAY)
        await tx.insert(scannerDevices).values({
          tenantId,
          editionId,
          name: scanner.name,
          enabledByMembershipId: headMembershipId ?? null,
          pairingCodeHash: secret(),
          pairingExpiresAt: new Date(pairedAt.getTime() + 15 * 60 * 1000),
          pairedAt,
          tokenHash: secret(),
          expiresAt: new Date(edition.endsAt.getTime() + DAY),
          revokedAt: scanner.revoked ? new Date(Date.now() - DAY) : null,
        })
      }
    }
  })

  // The rows are committed: the bucket gets the files they point at.
  await putObjects(objects)

  // A demo tenant is suspended or not as the list says, whatever an admin did to it since.
  await (spec.suspended ? suspendTenant(db, tenantId) : restoreTenant(db, tenantId))
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The seller's details and the provider account of a demo convention. The account is kept while
 * its credentials open to the demo ones: its row is replaced, never changed, so a rerun leaves it.
 */
/**
 * Puts the objects of rows that are committed. A file already there is put again with the same
 * bytes, so a bucket that lost one gets it back.
 */
async function putObjects(objects: PendingObject[]) {
  for (const { key, bytes, type, stale = [] } of objects) {
    await bucket.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: key,
        Body: bytes,
        ContentType: type,
      }),
    )
    if (stale.length > 0) {
      await bucket.send(
        new DeleteObjectsCommand({
          Bucket: s3.bucket,
          Delete: { Objects: stale.map((Key) => ({ Key })) },
        }),
      )
    }
  }
}

/**
 * The profile of a demo account, as the list says whatever was done to it since: what it holds,
 * whether it is published or taken down, and its avatar. The identifier of its page is the
 * database's and stays, so a link to a demo profile keeps working across runs. Its reports are
 * added once.
 */
async function seedProfile(profile: SeedProfile) {
  const id = await accountId(profile.email)
  const down = profile.takenDown
  const objects = await db.transaction(async (tx) => {
    await tx.insert(accountProfiles).values({ accountId: id }).onConflictDoNothing()
    await tx
      .update(accountProfiles)
      .set({
        description: profile.description ?? null,
        pronouns: profile.pronouns ?? null,
        city: profile.city ?? null,
        links: profile.links ?? [],
        interests: profile.interests ?? [],
        // The moment a profile was published or taken down stays the one of its first run.
        publishedAt:
          profile.published && !down ? sql`coalesce(${accountProfiles.publishedAt}, now())` : null,
        takenDownAt: down ? sql`coalesce(${accountProfiles.takenDownAt}, now())` : null,
        takenDownReason: down?.reason ?? null,
        takenDownNote: down?.note ?? null,
        takenDownAfterReport: down ? false : null,
        reviewRequestedAt: down?.reviewRequested
          ? sql`coalesce(${accountProfiles.reviewRequestedAt}, now())`
          : null,
      })
      .where(eq(accountProfiles.accountId, id))

    const [reported] = await tx
      .select({ id: profileReports.id })
      .from(profileReports)
      .where(eq(profileReports.accountId, id))
      .limit(1)
    if (!reported && profile.reports?.length) {
      await tx.insert(profileReports).values(
        profile.reports.map((report) => ({
          accountId: id,
          reason: report.reason,
          note: report.note ?? null,
          email: report.email ?? null,
          // The language its emails are written in goes with the address alone.
          locale: report.email ? DEMO_LOCALE : null,
        })),
      )
    }
    return profile.avatar ? [await seedAvatar(tx, id)] : []
  })
  await putObjects(objects)
}

/**
 * The avatar of a demo profile: a disc drawn by code, kept as the master the API makes its sizes
 * from, under the label the API keeps an avatar under.
 */
async function seedAvatar(tx: Tx, accountId: string): Promise<PendingObject> {
  const avatar = demoAvatar()
  const file = {
    contentType: 'image/png',
    size: avatar.bytes.length,
    sha256: createHash('sha256').update(avatar.bytes).digest('hex'),
    name: AVATAR_LABEL,
    width: avatar.width,
    height: avatar.height,
  }
  const [held] = await tx
    .select({ fileId: accountAvatars.fileId, sha256: accountFiles.sha256 })
    .from(accountAvatars)
    .innerJoin(accountFiles, eq(accountFiles.id, accountAvatars.fileId))
    .where(eq(accountAvatars.accountId, accountId))
  let fileId = held?.fileId
  // The API keeps the sizes it made of a master: those of a master drawn anew go with it.
  const redrawn = held !== undefined && held.sha256 !== file.sha256
  if (fileId) {
    // The seed owns its demo files: an avatar drawn anew since the last run is the file's new bytes.
    await tx.update(accountFiles).set(file).where(eq(accountFiles.id, fileId))
  } else {
    const [kept] = await tx
      .insert(accountFiles)
      .values({ accountId, kind: AVATAR_FILE_KIND, ...file })
      .returning({ id: accountFiles.id })
    fileId = kept!.id
    await tx.insert(accountAvatars).values({ accountId, fileId })
  }
  const key = `accounts/${accountId}/${fileId}/master`
  return {
    key,
    bytes: avatar.bytes,
    type: 'image/png',
    stale: redrawn ? AVATAR_SIZES.map((size) => key.replace(/master$/, size)) : [],
  }
}

async function seedShop(tx: Tx, tenantId: string, shop: SeedShop) {
  const { credentials, ...seller } = shop
  await tx
    .insert(shopSellers)
    .values({ tenantId, ...seller })
    .onConflictDoUpdate({ target: shopSellers.tenantId, set: seller })

  const [account] = await tx
    .select({
      provider: paymentProviderAccounts.provider,
      credentials: paymentProviderAccounts.credentials,
      readyAt: paymentProviderAccounts.readyAt,
    })
    .from(paymentProviderAccounts)
    .where(eq(paymentProviderAccounts.tenantId, tenantId))
  const wanted = JSON.stringify(credentials)
  const sealedFor = providerAccountOf(tenantId, 'fake')
  const opens = (sealed: string) => {
    try {
      return open(credentialsKey, sealed, sealedFor) === wanted
    } catch {
      // Sealed with another key or for another account, or not sealed at all.
      return false
    }
  }
  if (account?.provider === 'fake' && account.readyAt && opens(account.credentials)) return
  await tx.delete(paymentProviderAccounts).where(eq(paymentProviderAccounts.tenantId, tenantId))
  await tx.insert(paymentProviderAccounts).values({
    tenantId,
    provider: 'fake',
    credentials: seal(credentialsKey, wanted, sealedFor),
    readyAt: new Date(),
  })
}

/**
 * The shop of a demo edition: its documents, each with one version, its consents in their order,
 * and whether it is open. A document is identified by its kind within a seeded edition, a consent
 * by its sentence. Answers the files the bucket is to hold.
 */
async function seedEditionShop(
  tx: Tx,
  tenantId: string,
  editionId: string,
  shop: SeedEditionShop,
): Promise<PendingObject[]> {
  const objects: PendingObject[] = []
  const documentIds = new Map<DocumentKind, string>()
  for (const document of shop.documents) {
    const [existing] = await tx
      .select({ id: editionDocuments.id })
      .from(editionDocuments)
      .where(
        and(eq(editionDocuments.editionId, editionId), eq(editionDocuments.kind, document.kind)),
      )
    const [saved] = existing
      ? await tx
          .update(editionDocuments)
          .set({ title: document.title, hiddenAt: null })
          .where(eq(editionDocuments.id, existing.id))
          .returning({ id: editionDocuments.id })
      : await tx
          .insert(editionDocuments)
          .values({ tenantId, editionId, kind: document.kind, title: document.title })
          .returning({ id: editionDocuments.id })
    const documentId = saved!.id
    documentIds.set(document.kind, documentId)

    const bytes = demoPdf(document.title, document.lines)
    const file = {
      contentType: 'application/pdf',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      name: `${document.title}.pdf`,
    }
    const [version] = await tx
      .select({ fileId: editionDocumentVersions.fileId })
      .from(editionDocumentVersions)
      .where(
        and(
          eq(editionDocumentVersions.documentId, documentId),
          eq(editionDocumentVersions.number, 1),
        ),
      )
    let fileId = version?.fileId
    if (fileId) {
      // The seed owns its demo files: a text changed since the last run is the file's new bytes.
      await tx.update(uploadedFiles).set(file).where(eq(uploadedFiles.id, fileId))
    } else {
      const [kept] = await tx
        .insert(uploadedFiles)
        .values({ tenantId, editionId, kind: DOCUMENT_FILE_KIND, ...file })
        .returning({ id: uploadedFiles.id })
      fileId = kept!.id
      await tx
        .insert(editionDocumentVersions)
        .values({ tenantId, editionId, documentId, number: 1, fileId })
    }
    objects.push({ key: fileObjectKey(tenantId, fileId), bytes, type: 'application/pdf' })
  }

  for (const [index, consent] of shop.consents.entries()) {
    const values = {
      documentId: consent.document ? documentIds.get(consent.document)! : null,
      isRequired: consent.isRequired,
      position: index + 1,
      hiddenAt: null,
    }
    const [existing] = await tx
      .select({ id: editionConsents.id })
      .from(editionConsents)
      .where(and(eq(editionConsents.editionId, editionId), eq(editionConsents.text, consent.text)))
    if (existing) {
      await tx.update(editionConsents).set(values).where(eq(editionConsents.id, existing.id))
    } else {
      await tx
        .insert(editionConsents)
        .values({ tenantId, editionId, text: consent.text, ...values })
    }
  }

  // An open shop keeps the moment it was opened at.
  const faqUrl = shop.faqUrl ?? null
  await tx
    .insert(editionShops)
    .values({ tenantId, editionId, faqUrl, openedAt: shop.open ? new Date() : null })
    .onConflictDoUpdate({
      target: editionShops.editionId,
      set: {
        faqUrl,
        openedAt: shop.open ? sql`coalesce(${editionShops.openedAt}, now())` : null,
      },
    })
  return objects
}

/** Midnight UTC of the day `days` from the run, so that two runs of a day agree. */
const dayFromNow = (days: Days) => new Date((Math.floor(Date.now() / DAY) + days) * DAY)

/**
 * The catalog of a demo edition. A ticket type, an add-on, an item and a custom field are
 * identified by their name within a seeded edition, an axis by its name within its item, a value
 * by its label, a variant by its values: their rows stay across runs, so what points at them later
 * still does. The lists that travel with a ticket type are written anew each run. Answers the size
 * charts the bucket is to hold.
 */
async function seedCatalog(
  tx: Tx,
  tenantId: string,
  editionId: string,
  edition: Pick<SeedEdition, 'startsAt' | 'endsAt'>,
  catalog: SeedCatalog,
): Promise<PendingObject[]> {
  const objects: PendingObject[] = []
  const at = { tenantId, editionId }

  await tx
    .update(editionShops)
    .set({
      ...catalog.ageBands,
      guardianConsentFormUrl: catalog.guardianConsentFormUrl,
      merchPreorderDeadline: new Date(
        edition.startsAt.getTime() - catalog.preorderEndsDaysBefore * DAY,
      ),
      merchOnlyEnabled: catalog.merchOnly,
      salesClosedMessage: catalog.salesClosedMessage,
      pickupInformation: catalog.pickupInformation,
      openingHours: catalog.openingHours,
      reminderDaysBefore: catalog.reminderDaysBefore,
    })
    .where(eq(editionShops.editionId, editionId))

  for (const [index, field] of catalog.customFields.entries()) {
    const values = { isRequired: field.isRequired, position: index + 1, hiddenAt: null }
    const [existing] = await tx
      .select({ id: editionCustomFields.id })
      .from(editionCustomFields)
      .where(
        and(
          eq(editionCustomFields.editionId, editionId),
          eq(editionCustomFields.label, field.label),
        ),
      )
    if (existing) {
      await tx
        .update(editionCustomFields)
        .set(values)
        .where(eq(editionCustomFields.id, existing.id))
    } else {
      await tx.insert(editionCustomFields).values({ ...at, label: field.label, ...values })
    }
  }

  const addOnIds = new Map<string, string>()
  for (const [index, addOn] of catalog.addOns.entries()) {
    const values = {
      description: addOn.description,
      amountMinor: addOn.amountMinor,
      kind: addOn.kind,
      capacity: addOn.capacity ?? null,
      placesLeftThreshold: addOn.placesLeftThreshold ?? null,
      position: index + 1,
      hiddenAt: null,
    }
    const [existing] = await tx
      .select({ id: addOns.id })
      .from(addOns)
      .where(and(eq(addOns.editionId, editionId), eq(addOns.name, addOn.name)))
    const [saved] = existing
      ? await tx
          .update(addOns)
          .set(values)
          .where(eq(addOns.id, existing.id))
          .returning({ id: addOns.id })
      : await tx
          .insert(addOns)
          .values({ ...at, name: addOn.name, ...values })
          .returning({ id: addOns.id })
    addOnIds.set(addOn.name, saved!.id)
  }

  const itemIds = new Map<string, string>()
  for (const [index, item] of catalog.items.entries()) {
    const values = {
      description: item.description,
      amountMinor: item.amountMinor,
      perOrderLimit: item.perOrderLimit,
      picturesIllustrative: item.picturesIllustrative ?? false,
      position: index + 1,
      hiddenAt: null,
    }
    const [existing] = await tx
      .select({ id: merchandiseItems.id })
      .from(merchandiseItems)
      .where(and(eq(merchandiseItems.editionId, editionId), eq(merchandiseItems.name, item.name)))
    const [saved] = existing
      ? await tx
          .update(merchandiseItems)
          .set(values)
          .where(eq(merchandiseItems.id, existing.id))
          .returning({ id: merchandiseItems.id })
      : await tx
          .insert(merchandiseItems)
          .values({ ...at, name: item.name, ...values })
          .returning({ id: merchandiseItems.id })
    itemIds.set(item.name, saved!.id)
    objects.push(...(await seedVariants(tx, { ...at, merchandiseItemId: saved!.id }, item)))
  }

  for (const [index, type] of catalog.ticketTypes.entries()) {
    const values = {
      shortDescription: type.shortDescription,
      longDescription: type.longDescription,
      capacity: type.capacity ?? null,
      saleStartsAt: dayFromNow(-90),
      saleEndsAt: edition.endsAt,
      allowsChild: type.ageBands.includes('child'),
      allowsTeen: type.ageBands.includes('teen'),
      allowsAdult: type.ageBands.includes('adult'),
      discountsExcluded: type.discountsExcluded ?? false,
      shownOutsideSaleWindow: true,
      position: index + 1,
      hiddenAt: null,
    }
    const [existing] = await tx
      .select({ id: ticketTypes.id })
      .from(ticketTypes)
      .where(and(eq(ticketTypes.editionId, editionId), eq(ticketTypes.name, type.name)))
    const [saved] = existing
      ? await tx
          .update(ticketTypes)
          .set(values)
          .where(eq(ticketTypes.id, existing.id))
          .returning({ id: ticketTypes.id })
      : await tx
          .insert(ticketTypes)
          .values({ ...at, name: type.name, ...values })
          .returning({ id: ticketTypes.id })
    const of = { ...at, ticketTypeId: saved!.id }

    await tx.delete(ticketTypePriceTiers).where(eq(ticketTypePriceTiers.ticketTypeId, saved!.id))
    await tx.insert(ticketTypePriceTiers).values(
      type.tiers.map((tier) => ({
        ...of,
        amountMinor: tier.amountMinor,
        startsAt: dayFromNow(tier.from),
        endsAt: tier.until === 'end' ? edition.endsAt : dayFromNow(tier.until),
      })),
    )
    await tx
      .delete(ticketTypeSupporterPrices)
      .where(eq(ticketTypeSupporterPrices.ticketTypeId, saved!.id))
    if (type.supporterPrices?.length) {
      await tx
        .insert(ticketTypeSupporterPrices)
        .values(type.supporterPrices.map((amountMinor) => ({ ...of, amountMinor })))
    }
    await tx.delete(ticketTypePerks).where(eq(ticketTypePerks.ticketTypeId, saved!.id))
    await tx
      .insert(ticketTypePerks)
      .values(type.perks.map((name, place) => ({ ...of, name, position: place + 1 })))
    await tx.delete(ticketTypeAddOns).where(eq(ticketTypeAddOns.ticketTypeId, saved!.id))
    if (type.addOns?.length) {
      await tx
        .insert(ticketTypeAddOns)
        .values(type.addOns.map((name) => ({ ...of, addOnId: addOnIds.get(name)! })))
    }
    await tx
      .delete(ticketTypeMerchandiseItems)
      .where(eq(ticketTypeMerchandiseItems.ticketTypeId, saved!.id))
    if (type.items?.length) {
      await tx
        .insert(ticketTypeMerchandiseItems)
        .values(type.items.map((name) => ({ ...of, merchandiseItemId: itemIds.get(name)! })))
    }
  }
  return objects
}

/**
 * The axes, values, size charts and variants of a demo item. A variant is found by its values,
 * so its row stays across runs; one the list no longer names goes.
 */
/** A QR code's text, as the API draws one: 160 random bits in capitals and digits. */
const demoQrCode = () =>
  Array.from(randomBytes(32), (byte) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[byte % 32]).join('')

/**
 * A demo order, placed once: one the seed finds by its number stays as a demo left it. Its lines
 * take their prices from the catalog as it stands, and its total is their sum.
 */
/**
 * A discount code of a demo edition with what it applies to, valid for ten years around now. One
 * that is there already stays as the demo left it.
 */
async function seedDiscountCode(
  tx: Tx,
  tenantId: string,
  editionId: string,
  code: SeedDiscountCode,
) {
  const [existing] = await tx
    .select({ id: discountCodes.id })
    .from(discountCodes)
    .where(and(eq(discountCodes.editionId, editionId), eq(discountCodes.code, code.code)))
  if (existing) return
  const at = { tenantId, editionId }
  const [row] = await tx
    .insert(discountCodes)
    .values({
      ...at,
      code: code.code,
      kind: code.percent ? 'percent' : 'amount',
      percent: code.percent ?? null,
      amountMinor: code.amountMinor ?? null,
      usageLimit: code.usageLimit ?? null,
      validFrom: new Date(Date.now() - 365 * DAY),
      validUntil: new Date(Date.now() + 3650 * DAY),
    })
    .returning({ id: discountCodes.id })
  const discountCodeId = row!.id
  for (const name of code.ticketTypes ?? []) {
    const [type] = await tx
      .select({ id: ticketTypes.id })
      .from(ticketTypes)
      .where(and(eq(ticketTypes.editionId, editionId), eq(ticketTypes.name, name)))
    if (!type) throw new Error(`No demo ticket type ${name}`)
    await tx
      .insert(discountCodeTicketTypes)
      .values({ ...at, discountCodeId, ticketTypeId: type.id })
  }
  for (const name of code.items ?? []) {
    const [item] = await tx
      .select({ id: merchandiseItems.id })
      .from(merchandiseItems)
      .where(and(eq(merchandiseItems.editionId, editionId), eq(merchandiseItems.name, name)))
    if (!item) throw new Error(`No demo merchandise item ${name}`)
    await tx
      .insert(discountCodeMerchandiseItems)
      .values({ ...at, discountCodeId, merchandiseItemId: item.id })
  }
}

/**
 * The order link of a demo order, under a token the demo knows: the tokens of real links are
 * random, and only their hashes are kept. Made once; one that is there stays.
 */
async function seedOrderLink(
  tx: Tx,
  of: { tenantId: string; editionId: string; orderId: string },
  order: SeedOrder,
) {
  if (!order.link) return
  await tx
    .insert(orderLinks)
    .values({
      ...of,
      tokenHash: createHash('sha256').update(`demo-order-link-${order.number}`).digest('hex'),
      expiresAt: new Date(Date.now() + (order.link === 'valid' ? 3650 : -1) * DAY),
    })
    .onConflictDoNothing({ target: orderLinks.tokenHash })
}

/**
 * What a demo email said, as the outbox keeps the text of one it sent: without the QR code and
 * the token of the order link, which only its recipient sees. The seed sends nothing, so the text
 * is a short one of its own, after the wording of the real email.
 */
function demoEmailText(
  kind: (typeof orderEmails.kind.enumValues)[number],
  { number, conventionName }: { number: string; conventionName: string },
): { subject: string; body: string } {
  const handedOver = [
    'YOUR QR CODE',
    `The QR code of the order ${number}: […]`,
    'See your order: https://portal.example/order#[…]',
  ]
  const said = (subject: string, ...paragraphs: string[]) => ({
    subject,
    body: [...paragraphs, 'OPOS'].join('\n\n'),
  })
  switch (kind) {
    case 'order-confirmation':
      return said(
        `Your order ${number} for ${conventionName} is paid`,
        `Thank you. Your order ${number} for ${conventionName} is paid.`,
        ...handedOver,
      )
    case 'order-email-changed':
      return said(
        `Your order ${number} for ${conventionName} is now under this email address`,
        `An organizer of ${conventionName} moved the order ${number} to this email address.`,
        ...handedOver,
      )
    case 'order-expired':
      return said(
        `Your order ${number} for ${conventionName} has expired`,
        `Your order ${number} for ${conventionName} was not paid in time and has expired. Nothing was charged.`,
      )
    case 'payment-under-review':
      return said(
        `Your payment for the order ${number} is under review`,
        `Your payment for the order ${number} for ${conventionName} arrived, but it could not confirm the order, so an organizer has to look at it.`,
        `An organizer of ${conventionName} will get in touch with you. You do not need to pay again.`,
      )
    case 'payment-not-needed':
      return said(
        `A payment arrived that your order ${number} does not need`,
        `A payment arrived for your order ${number} for ${conventionName}, which was not waiting for one any more. It changes nothing of the order.`,
      )
    default:
      throw new Error(`No demo text for the email ${kind}`)
  }
}

async function seedOrder(
  tx: Tx,
  { conventionName, ...at }: { tenantId: string; editionId: string; conventionName: string },
  order: SeedOrder,
) {
  const { tenantId, editionId } = at
  const [existing] = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.number, order.number)))
  if (existing) {
    // The order stays as the demo left it; its link is one the demo can always open.
    await seedOrderLink(tx, { ...at, orderId: existing.id }, order)
    // An email seeded before texts were kept says now what one of its kind says.
    for (const kind of order.emails ?? []) {
      await tx
        .update(orderEmails)
        .set(demoEmailText(kind, { number: order.number, conventionName }))
        .where(
          and(
            eq(orderEmails.orderId, existing.id),
            eq(orderEmails.kind, kind),
            isNotNull(orderEmails.sentAt),
            isNull(orderEmails.body),
          ),
        )
    }
    return
  }
  const placedAt = new Date(Date.now() - order.placedDaysAgo * DAY - HOUR)
  const settledAt = new Date(placedAt.getTime() + 5 * 60 * 1000)

  const lines: (typeof orderLines.$inferInsert)[] = []
  const line = (given: Partial<typeof orderLines.$inferInsert> & { unitAmountMinor: number }) => {
    // A complimentary order sells the same catalog for nothing.
    const values = order.manualReason === 'complimentary' ? { ...given, unitAmountMinor: 0 } : given
    const quantity = values.quantity ?? 1
    lines.push({
      ...at,
      orderId: '',
      kind: 'ticket',
      quantity,
      amountMinor: quantity * values.unitAmountMinor,
      ...values,
    })
  }
  if (order.ticketType) {
    const [type] = await tx
      .select({ id: ticketTypes.id, amountMinor: ticketTypePriceTiers.amountMinor })
      .from(ticketTypes)
      .innerJoin(ticketTypePriceTiers, eq(ticketTypePriceTiers.ticketTypeId, ticketTypes.id))
      .where(and(eq(ticketTypes.editionId, editionId), eq(ticketTypes.name, order.ticketType)))
      .orderBy(ticketTypePriceTiers.startsAt)
      .limit(1)
    if (!type) throw new Error(`No demo ticket type ${order.ticketType}`)
    line({ kind: 'ticket', ticketTypeId: type.id, unitAmountMinor: type.amountMinor })
  }
  for (const name of order.addOns ?? []) {
    const [addOn] = await tx
      .select({ id: addOns.id, amountMinor: addOns.amountMinor })
      .from(addOns)
      .where(and(eq(addOns.editionId, editionId), eq(addOns.name, name)))
    if (!addOn) throw new Error(`No demo add-on ${name}`)
    line({ kind: 'add_on', addOnId: addOn.id, unitAmountMinor: addOn.amountMinor })
  }
  for (const wanted of order.items ?? []) {
    const [item] = await tx
      .select({ id: merchandiseItems.id, amountMinor: merchandiseItems.amountMinor })
      .from(merchandiseItems)
      .where(and(eq(merchandiseItems.editionId, editionId), eq(merchandiseItems.name, wanted.name)))
    if (!item) throw new Error(`No demo merchandise item ${wanted.name}`)
    const variants = await tx
      .select({ id: merchandiseVariants.id, label: merchandiseOptionValues.label })
      .from(merchandiseVariants)
      .leftJoin(
        merchandiseVariantValues,
        eq(merchandiseVariantValues.variantId, merchandiseVariants.id),
      )
      .leftJoin(
        merchandiseOptionValues,
        eq(merchandiseOptionValues.id, merchandiseVariantValues.optionValueId),
      )
      .where(eq(merchandiseVariants.merchandiseItemId, item.id))
    const values = [...(wanted.values ?? [])].sort().join('|')
    const variant = [...new Set(variants.map((row) => row.id))].find(
      (id) =>
        variants
          .filter((row) => row.id === id)
          .flatMap((row) => row.label ?? [])
          .sort()
          .join('|') === values,
    )
    if (!variant) throw new Error(`No demo variant of ${wanted.name}: ${values}`)
    line({
      kind: 'merchandise',
      merchandiseItemId: item.id,
      merchandiseVariantId: variant,
      quantity: wanted.quantity,
      unitAmountMinor: item.amountMinor,
    })
  }
  // A discount code lowers the lines it applies to together, as one line of the order.
  let discountCodeId: string | null = null
  if (order.discountCode) {
    const [code] = await tx
      .select()
      .from(discountCodes)
      .where(
        and(eq(discountCodes.editionId, editionId), eq(discountCodes.code, order.discountCode)),
      )
    if (!code) throw new Error(`No demo discount code ${order.discountCode}`)
    const types = await tx
      .select({ id: discountCodeTicketTypes.ticketTypeId })
      .from(discountCodeTicketTypes)
      .where(eq(discountCodeTicketTypes.discountCodeId, code.id))
    const items = await tx
      .select({ id: discountCodeMerchandiseItems.merchandiseItemId })
      .from(discountCodeMerchandiseItems)
      .where(eq(discountCodeMerchandiseItems.discountCodeId, code.id))
    const lowered = lines
      .filter(
        (held) =>
          types.some((type) => type.id === held.ticketTypeId) ||
          items.some((item) => item.id === held.merchandiseItemId),
      )
      .reduce((sum, held) => sum + held.amountMinor, 0)
    const off = code.percent
      ? Math.floor((lowered * code.percent + 50) / 100)
      : Math.min(code.amountMinor ?? 0, lowered)
    discountCodeId = code.id
    line({ kind: 'discount', unitAmountMinor: -off })
  }
  const totalMinor = lines.reduce((sum, { amountMinor }) => sum + amountMinor, 0)

  // The order a "Buy more" order was started from, with the QR code it carries.
  let extended: { id: string; qrCodeId: string } | null = null
  if (order.extends) {
    const [row] = await tx
      .select({ id: orders.id, qrCodeId: orderQrCodeOrders.qrCodeId })
      .from(orders)
      .innerJoin(orderQrCodeOrders, eq(orderQrCodeOrders.orderId, orders.id))
      .where(and(eq(orders.tenantId, tenantId), eq(orders.number, order.extends)))
    if (!row) throw new Error(`No paid demo order ${order.extends} to extend`)
    extended = row
  }

  const paid = ['paid', 'paid-manual', 'canceled'].includes(order.status)
  const [placed] = await tx
    .insert(orders)
    .values({
      ...at,
      number: order.number,
      status: order.status,
      email: order.email ?? null,
      holderName: order.holderName,
      ageBand: order.ageBand,
      totalMinor,
      // What each status holds of stock and capacity.
      holds: ['awaiting-payment', 'paid', 'paid-manual', 'needs-review'].includes(order.status),
      // The one awaiting payment keeps doing so while the demo stands: its hold ends in ten years.
      holdEndsAt:
        order.status === 'awaiting-payment'
          ? new Date(Date.now() + 3650 * DAY)
          : order.status === 'expired'
            ? new Date(placedAt.getTime() + 30 * 60 * 1000)
            : null,
      placedAt,
      paidAt: paid ? settledAt : null,
      guardianConsentAcknowledgedAt: order.ageBand === 'teen' ? placedAt : null,
      providerConsentAcceptedAt: order.email ? placedAt : null,
      // Nobody holds the token of a demo order: its result page opens for no one.
      resultTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      manualReason: order.manualReason ?? null,
      note: order.note ?? null,
      discountCodeId,
      extendsOrderId: extended?.id ?? null,
    })
    .returning({ id: orders.id })
  const orderId = placed!.id
  const of = { ...at, orderId }
  await tx.insert(orderLines).values(lines.map((values) => ({ ...values, orderId })))

  // What a buyer answers and accepts with an order; a manual order has neither.
  if (order.email) {
    if (order.ticketType) {
      // Each demo ticket holder answered the edition's first field, required or not, so the
      // order's page, the sales and the exports have answers to show.
      const fields = await tx
        .select({ id: editionCustomFields.id })
        .from(editionCustomFields)
        .where(eq(editionCustomFields.editionId, editionId))
        .orderBy(editionCustomFields.position)
        .limit(1)
      if (fields.length > 0) {
        await tx
          .insert(orderCustomFieldAnswers)
          .values(fields.map((field) => ({ ...of, customFieldId: field.id, answer: 'Poznań' })))
      }
    }
    const consents = await tx
      .select({
        id: editionConsents.id,
        // The version in force of the document the consent links, named in full: a column of
        // the outer table is written here without its table.
        versionId: sql<string | null>`(
          select v.id from edition_document_versions v
          where v.document_id = edition_consents.document_id
          order by v.number desc limit 1
        )`,
      })
      .from(editionConsents)
      .where(and(eq(editionConsents.editionId, editionId), eq(editionConsents.isRequired, true)))
    if (consents.length > 0) {
      await tx.insert(orderConsents).values(
        consents.map((consent) => ({
          ...of,
          consentId: consent.id,
          documentVersionId: consent.versionId,
          acceptedAt: placedAt,
        })),
      )
    }
  }

  if (order.account) {
    // Read in this transaction: the seed's one connection is the transaction's.
    const [account] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.email, order.account))
    if (!account) throw new Error(`Seed account ${order.account} is missing`)
    await tx.insert(orderAccounts).values({ ...of, accountId: account.id })
  }

  // A paid order of the shop has one QR code, sealed for its own row. One whose email changed
  // had another before, kept as replaced.
  if (order.status === 'paid') {
    const code = async (replacedAt: Date | null) => {
      const id = randomUUID()
      const text = demoQrCode()
      await tx.insert(orderQrCodes).values({
        ...at,
        id,
        codeHash: createHash('sha256').update(text).digest('hex'),
        code: seal(credentialsKey, text, orderQrCodeOf(tenantId, id)),
        replacedAt,
      })
      return id
    }
    if (order.emailChanged) await code(settledAt)
    // What was bought with "Buy more" joins the QR code of the order it extends.
    await tx
      .insert(orderQrCodeOrders)
      .values({ ...of, qrCodeId: extended?.qrCodeId ?? (await code(null)) })
  }

  await seedOrderLink(tx, of, order)

  for (const [index, attempt] of (order.attempts ?? []).entries()) {
    const confirmed = attempt.status === 'paid' || attempt.status === 'refused'
    const reference = confirmed ? `FAKE-DEMO-${order.number}-${index + 1}` : null
    await tx.insert(paymentAttempts).values({
      ...of,
      provider: 'fake',
      status: attempt.status,
      amountMinor: totalMinor,
      paidAmountMinor: confirmed ? (attempt.paidAmountMinor ?? totalMinor) : null,
      paidAt: confirmed ? settledAt : null,
      confirmedAt: confirmed ? settledAt : null,
      moneyWith: attempt.status === 'paid' ? 'convention' : confirmed ? 'buyer' : null,
      providerReference: reference,
      information: reference ? { transaction: reference } : null,
      failureReason: attempt.failureReason ?? null,
      failureCode: attempt.failureReason ?? null,
      failureMessage: attempt.failureReason
        ? `The fake provider reports ${attempt.failureReason}`
        : null,
      // In the order they were started.
      createdAt: new Date(placedAt.getTime() + (index + 1) * 60 * 1000),
    })
  }

  if (order.email && order.emails) {
    await tx.insert(orderEmails).values(
      order.emails.map((kind) => ({
        ...of,
        kind,
        recipient: order.email!,
        queuedAt: settledAt,
        sentAt: settledAt,
        nextAttemptAt: settledAt,
        ...demoEmailText(kind, { number: order.number, conventionName }),
      })),
    )
  }
}

async function seedVariants(
  tx: Tx,
  of: { tenantId: string; editionId: string; merchandiseItemId: string },
  item: SeedMerchandise,
): Promise<PendingObject[]> {
  const objects: PendingObject[] = []
  const itemId = of.merchandiseItemId
  /** The value of a label, with its axis: a label is one value of one axis of the item. */
  const valueOf = new Map<string, { id: string; axisId: string }>()

  for (const [index, axis] of (item.axes ?? []).entries()) {
    const [existing] = await tx
      .select({ id: merchandiseOptionAxes.id })
      .from(merchandiseOptionAxes)
      .where(
        and(
          eq(merchandiseOptionAxes.merchandiseItemId, itemId),
          eq(merchandiseOptionAxes.name, axis.name),
        ),
      )
    const [saved] = existing
      ? await tx
          .update(merchandiseOptionAxes)
          .set({ position: index + 1 })
          .where(eq(merchandiseOptionAxes.id, existing.id))
          .returning({ id: merchandiseOptionAxes.id })
      : await tx
          .insert(merchandiseOptionAxes)
          .values({ ...of, name: axis.name, position: index + 1 })
          .returning({ id: merchandiseOptionAxes.id })
    const axisId = saved!.id

    for (const [place, label] of axis.values.entries()) {
      const [held] = await tx
        .select({ id: merchandiseOptionValues.id })
        .from(merchandiseOptionValues)
        .where(
          and(eq(merchandiseOptionValues.axisId, axisId), eq(merchandiseOptionValues.label, label)),
        )
      const [value] = held
        ? await tx
            .update(merchandiseOptionValues)
            .set({ position: place + 1 })
            .where(eq(merchandiseOptionValues.id, held.id))
            .returning({ id: merchandiseOptionValues.id })
        : await tx
            .insert(merchandiseOptionValues)
            .values({ ...of, axisId, label, position: place + 1 })
            .returning({ id: merchandiseOptionValues.id })
      valueOf.set(label, { id: value!.id, axisId })
      if (axis.sizeCharts) {
        objects.push(await seedSizeChart(tx, of, value!.id, label, place))
      }
    }
  }

  const stored = await tx
    .select({
      variantId: merchandiseVariants.id,
      valueId: merchandiseVariantValues.optionValueId,
    })
    .from(merchandiseVariants)
    .leftJoin(
      merchandiseVariantValues,
      eq(merchandiseVariantValues.variantId, merchandiseVariants.id),
    )
    .where(eq(merchandiseVariants.merchandiseItemId, itemId))
  const key = (valueIds: (string | null)[]) => valueIds.filter(Boolean).sort().join(' ')
  const variantByKey = new Map(
    [...Map.groupBy(stored, (row) => row.variantId)].map(([variantId, rows]) => [
      key(rows.map((row) => row.valueId)),
      variantId,
    ]),
  )
  // An item without axes is sold as its one variant.
  const wanted = item.variants ?? [{ values: [], stock: item.stock ?? 0 }]
  const kept = new Set<string>()
  for (const variant of wanted) {
    const values = variant.values.map((label) => valueOf.get(label)!)
    const existing = variantByKey.get(key(values.map((value) => value.id)))
    if (existing) {
      await tx
        .update(merchandiseVariants)
        .set({ stock: variant.stock, hiddenAt: null })
        .where(eq(merchandiseVariants.id, existing))
      kept.add(existing)
      continue
    }
    const [made] = await tx
      .insert(merchandiseVariants)
      .values({ ...of, stock: variant.stock })
      .returning({ id: merchandiseVariants.id })
    kept.add(made!.id)
    if (values.length > 0) {
      await tx.insert(merchandiseVariantValues).values(
        values.map((value) => ({
          ...of,
          variantId: made!.id,
          axisId: value.axisId,
          optionValueId: value.id,
        })),
      )
    }
  }
  await tx
    .delete(merchandiseVariants)
    .where(
      and(
        eq(merchandiseVariants.merchandiseItemId, itemId),
        notInArray(merchandiseVariants.id, [...kept]),
      ),
    )
  return objects
}

/**
 * The size chart of a value of a demo item: an empty table drawn by code, kept as the master the
 * API makes its sizes from. The table has a row more for each value, so each chart is its own
 * file.
 */
async function seedSizeChart(
  tx: Tx,
  of: { tenantId: string; editionId: string },
  valueId: string,
  label: string,
  index: number,
): Promise<PendingObject> {
  const chart = demoChart(4 + index, 4)
  const file = {
    contentType: 'image/png',
    size: chart.bytes.length,
    sha256: createHash('sha256').update(chart.bytes).digest('hex'),
    name: `Size chart - ${label}.png`,
    width: chart.width,
    height: chart.height,
  }
  const [held] = await tx
    .select({ fileId: merchandiseSizeCharts.fileId, sha256: uploadedFiles.sha256 })
    .from(merchandiseSizeCharts)
    .innerJoin(uploadedFiles, eq(uploadedFiles.id, merchandiseSizeCharts.fileId))
    .where(eq(merchandiseSizeCharts.optionValueId, valueId))
  let fileId = held?.fileId
  // The API keeps the sizes it made of a master: those of a master drawn anew go with it.
  const redrawn = held !== undefined && held.sha256 !== file.sha256
  if (fileId) {
    // The seed owns its demo files: a chart drawn anew since the last run is the file's new bytes.
    await tx.update(uploadedFiles).set(file).where(eq(uploadedFiles.id, fileId))
  } else {
    const [kept] = await tx
      .insert(uploadedFiles)
      .values({
        tenantId: of.tenantId,
        editionId: of.editionId,
        kind: SIZE_CHART_FILE_KIND,
        ...file,
      })
      .returning({ id: uploadedFiles.id })
    fileId = kept!.id
    await tx
      .insert(merchandiseSizeCharts)
      .values({ tenantId: of.tenantId, editionId: of.editionId, optionValueId: valueId, fileId })
  }
  const key = masterObjectKey(of.tenantId, fileId)
  return {
    key,
    bytes: chart.bytes,
    type: 'image/png',
    stale: redrawn ? CHART_SIZES.map((size) => key.replace(/master$/, size)) : [],
  }
}

try {
  const seeded = SEEDS_ADMIN ? [...ACCOUNTS, ADMIN] : ACCOUNTS
  for (const account of seeded) await ensureAccount(account)
  await ensureTwoFactor(MFA_EMAIL)
  if (SEEDS_ADMIN) {
    await ensureTwoFactor(ADMIN.email)
    await ensureAdmin(ADMIN.email)
  }
  for (const tenant of TENANTS) await seedTenant(tenant)
  for (const profile of PROFILES) await seedProfile(profile)
  console.log(
    `Seeded ${TENANTS.length} tenants and ${seeded.length} accounts; password ${DEV_PASSWORD}.`,
  )
} finally {
  await db.$client.end()
}
