// @vitest-environment node
import { setupI18n } from '@lingui/core'
import { type Locale } from '@opos/i18n'
import { describe, expect, it, vi } from 'vitest'
import { type PublicReads } from './reads'
import { type HeadContext, matchRoute, pageHead, plainHead } from './routes'

const API = 'https://api.opos.example'
const LOGO = '11111111-1111-4111-8111-111111111111'
const AVATAR = '22222222-2222-4222-8222-222222222222'
const ITEM = '33333333-3333-4333-8333-333333333333'
const PROFILE = '44444444-4444-4444-8444-444444444444'
const BLURB =
  'OPOS is the platform conventions use for their programme, tickets and attendee sign-ups. It is free for conventions.'

const convention = {
  name: 'Convention A',
  defaultLocale: 'en',
  timezone: 'Europe/Warsaw',
  logo: { fileId: LOGO, width: 800, height: 400 },
}

// It starts half an hour after midnight in Warsaw, which is still the day before in UTC.
const edition = {
  id: '55555555-5555-4555-8555-555555555555',
  slug: '2027',
  name: 'Convention A 2027',
  startsAt: '2027-03-11T23:30:00.000Z',
  endsAt: '2027-03-14T17:00:00.000Z',
  isActive: true,
  venueName: 'Fair Hall',
  venueAddress: 'Street 1',
  venueCity: 'Poznań',
}

const item = {
  id: ITEM,
  title: 'Opening',
  description: 'First line\nsecond line',
  startsAt: '2027-03-12T09:00:00.000Z',
  endsAt: '2027-03-12T10:00:00.000Z',
  speakers: [],
  likeCount: 3,
}

const profile = {
  profileId: PROFILE,
  firstName: 'Anna',
  nickname: 'Lisek',
  lastName: 'Nowak',
  nameOrder: 'nickname-middle' as const,
  avatar: { fileId: AVATAR },
  description: 'I run games.\nMostly horror.',
  pronouns: null,
  city: null,
  links: [],
  interests: [],
}

// The source messages stand in for both catalogs: what is told apart here is the language chosen.
const translator = (locale: Locale) => {
  const i18n = setupI18n()
  i18n.loadAndActivate({ locale, messages: {} })
  return i18n
}

function setup(changes: Partial<PublicReads> = {}) {
  const reads: PublicReads = {
    convention: vi.fn().mockResolvedValue(convention),
    edition: vi.fn().mockResolvedValue(edition),
    programItem: vi.fn().mockResolvedValue(item),
    profile: vi.fn().mockResolvedValue(profile),
    ...changes,
  }
  const context: HeadContext = {
    reads,
    translators: { en: translator('en'), pl: translator('pl') },
    apiUrl: `${API}/`,
  }
  return { reads, context, head: (pathname: string) => pageHead(pathname, context) }
}

const dates = (locale: string, options: Intl.DateTimeFormatOptions, start: string, end: string) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: 'Europe/Warsaw' }).formatRange(
    new Date(start),
    new Date(end),
  )

const missing = { status: 404, parts: ['Page not found'], path: null, image: null, noIndex: true }

describe('matchRoute', () => {
  it('finds the route of an address, with what the address holds', () => {
    expect(matchRoute('/conventions/con-a/2027/program')).toEqual({
      path: '/conventions/:tenantSlug/:editionSlug/program',
      params: { tenantSlug: 'con-a', editionSlug: '2027' },
    })
  })

  it('reads an address with or without a slash at its end, in any case', () => {
    expect(matchRoute('/Login/')?.path).toBe('/login')
    expect(matchRoute('/')?.path).toBe('/')
  })

  it('decodes what an address holds', () => {
    expect(matchRoute('/conventions/a%20b')?.params).toEqual({ tenantSlug: 'a b' })
  })

  it('finds none for an address of no route, an empty part or a broken encoding', () => {
    expect(matchRoute('/nowhere')).toBeNull()
    expect(matchRoute('/conventions//2027')).toBeNull()
    expect(matchRoute('/conventions/%E0%A4%A')).toBeNull()
  })
})

describe('pageHead', () => {
  it('names the home page as the page does, in the default language', async () => {
    const { head } = setup()

    expect(await head('/')).toEqual({
      status: 200,
      locale: 'pl',
      application: 'OPOS',
      parts: ['Fantasy conventions, in one place'],
      description: BLURB,
      path: '/',
      image: null,
      noIndex: false,
    })
  })

  it('names the privacy policy and the terms', async () => {
    const { head } = setup()

    expect((await head('/privacy')).parts).toEqual(['Privacy policy'])
    expect((await head('/terms')).parts).toEqual(['Terms'])
  })

  it.each([
    ['/login', 'Sign in'],
    ['/register', 'Create an account'],
    ['/forgot-password', 'Reset your password'],
  ])('names %s as the page does, and says what the portal is', async (pathname, title) => {
    const { head } = setup()

    expect(await head(pathname)).toEqual({
      ...plainHead({ en: translator('en'), pl: translator('pl') }, pathname),
      parts: [title],
    })
  })

  it.each([
    ['/auth/confirm', 'Confirmation link'],
    ['/auth/mfa', 'Two-factor authentication'],
    ['/account', 'Your account'],
    ['/account/profile', 'Your profile'],
    ['/schedule', 'My schedule'],
    ['/conventions/con-a/2027/shop/checkout', 'Checkout'],
    [`/conventions/con-a/2027/shop/result/${ITEM}`, 'Your order'],
    ['/order', 'Your order'],
  ])(
    'names %s, which shows a stranger nothing, and keeps it out of search engines',
    async (pathname, title) => {
      const { head, reads } = setup()

      expect(await head(pathname)).toEqual({
        ...plainHead({ en: translator('en'), pl: translator('pl') }, pathname),
        parts: [title],
        noIndex: true,
      })
      // In the default language, a convention's checkout too: nothing is asked of the API
      expect(reads.convention).not.toHaveBeenCalled()
      expect(reads.edition).not.toHaveBeenCalled()
    },
  )

  it("names a convention in its own language, with its logo as the page's picture", async () => {
    const { head, reads } = setup()

    expect(await head('/conventions/con-a')).toEqual({
      status: 200,
      locale: 'en',
      application: 'OPOS',
      parts: ['Convention A'],
      description: BLURB,
      path: '/conventions/con-a',
      image: { url: `${API}/public/tenants/con-a/logo-files/${LOGO}/large`, alt: 'Convention A' },
      noIndex: false,
    })
    expect(reads.convention).toHaveBeenCalledWith('con-a')
  })

  it('falls back to the default language for a convention in one the portal lacks', async () => {
    const { head } = setup({
      convention: vi.fn().mockResolvedValue({ ...convention, defaultLocale: 'de' }),
    })

    expect((await head('/conventions/con-a')).locale).toBe('pl')
  })

  it('shows no picture for a convention with no logo', async () => {
    const { head } = setup({ convention: vi.fn().mockResolvedValue({ ...convention, logo: null }) })

    expect((await head('/conventions/con-a')).image).toBeNull()
  })

  it("says when and where an edition takes place, in the convention's time zone", async () => {
    const { head, reads } = setup()
    const when = dates('en', { dateStyle: 'medium' }, edition.startsAt, edition.endsAt)

    const answer = await head('/conventions/con-a/2027')

    expect(answer).toMatchObject({
      status: 200,
      locale: 'en',
      parts: ['Convention A 2027'],
      description: `${when} · Fair Hall, Street 1, Poznań`,
      path: '/conventions/con-a/2027',
      noIndex: false,
    })
    expect(answer.description).toContain('12')
    expect(answer.description).not.toContain('11')
    expect(answer.image?.url).toContain(`/logo-files/${LOGO}/large`)
    expect(reads.edition).toHaveBeenCalledWith('con-a', '2027')
  })

  it('says only when for an edition with no venue', async () => {
    const { head } = setup({
      edition: vi
        .fn()
        .mockResolvedValue({ ...edition, venueName: null, venueAddress: null, venueCity: null }),
    })

    expect((await head('/conventions/con-a/2027')).description).toBe(
      dates('en', { dateStyle: 'medium' }, edition.startsAt, edition.endsAt),
    )
  })

  it("names the programme and the shop of an edition, in the convention's language", async () => {
    const { head } = setup()

    expect(await head('/conventions/con-a/2027/program')).toMatchObject({
      locale: 'en',
      parts: ['Programme', 'Convention A 2027'],
      path: '/conventions/con-a/2027/program',
    })
    expect((await head('/conventions/con-a/2027/shop')).parts).toEqual([
      'Shop',
      'Convention A 2027',
    ])
  })

  it('names a programme item, and says when it is and what it is about', async () => {
    const { head, reads } = setup()
    const when = dates('en', { dateStyle: 'full', timeStyle: 'short' }, item.startsAt, item.endsAt)

    expect(await head(`/conventions/con-a/2027/program/${ITEM}`)).toMatchObject({
      status: 200,
      parts: ['Opening', 'Convention A 2027'],
      description: `${when} · First line second line`,
    })
    expect(reads.programItem).toHaveBeenCalledWith('con-a', '2027', ITEM)
  })

  it('starts what it says of a programme item with a capital letter, as the page does', async () => {
    const { head } = setup({
      convention: vi.fn().mockResolvedValue({ ...convention, defaultLocale: 'pl' }),
    })
    const when = dates('pl', { dateStyle: 'full', timeStyle: 'short' }, item.startsAt, item.endsAt)

    const answer = await head(`/conventions/con-a/2027/program/${ITEM}`)

    // Polish writes the day of the week small, and a sentence does not start so
    expect(when).toMatch(/^\p{Ll}/u)
    expect(answer.description).toBe(
      `${when[0]!.toLocaleUpperCase('pl')}${when.slice(1)} · First line second line`,
    )
  })

  it('says only when for a programme item with no description', async () => {
    const { head } = setup({
      programItem: vi.fn().mockResolvedValue({ ...item, description: null }),
    })

    expect((await head(`/conventions/con-a/2027/program/${ITEM}`)).description).toBe(
      dates('en', { dateStyle: 'full', timeStyle: 'short' }, item.startsAt, item.endsAt),
    )
  })

  it.each([
    ['a convention', '/conventions/nobody', { convention: vi.fn().mockResolvedValue(null) }],
    ['an edition', '/conventions/con-a/1999', { edition: vi.fn().mockResolvedValue(null) }],
    [
      "an edition's programme",
      '/conventions/con-a/1999/program',
      { edition: vi.fn().mockResolvedValue(null) },
    ],
    [
      "an edition's shop",
      '/conventions/con-a/1999/shop',
      { edition: vi.fn().mockResolvedValue(null) },
    ],
    [
      'a programme item',
      `/conventions/con-a/2027/program/${ITEM}`,
      { programItem: vi.fn().mockResolvedValue(null) },
    ],
    ['a profile', `/profiles/${PROFILE}`, { profile: vi.fn().mockResolvedValue(null) }],
  ])('answers that %s the API does not find is not there', async (_what, pathname, changes) => {
    const { head } = setup(changes)

    expect(await head(pathname)).toMatchObject(missing)
  })

  it('answers that an address of no route is not there', async () => {
    const { head } = setup()

    expect(await head('/nowhere')).toMatchObject({ ...missing, description: BLURB, locale: 'pl' })
  })

  it('names a published profile by its public name, and keeps it out of search engines', async () => {
    const { head, reads } = setup()

    expect(await head(`/profiles/${PROFILE}`)).toEqual({
      status: 200,
      locale: 'pl',
      application: 'OPOS',
      parts: ['Anna “Lisek” Nowak'],
      description: 'I run games. Mostly horror.',
      path: `/profiles/${PROFILE}`,
      image: {
        url: `${API}/public/avatar-files/${AVATAR}/large`,
        alt: 'Avatar of Anna “Lisek” Nowak',
      },
      noIndex: true,
    })
    expect(reads.profile).toHaveBeenCalledWith(PROFILE)
  })

  it('says what the portal is for a profile that describes nothing, and shows no avatar it lacks', async () => {
    const { head } = setup({
      profile: vi.fn().mockResolvedValue({ ...profile, description: null, avatar: null }),
    })

    expect(await head(`/profiles/${PROFILE}`)).toMatchObject({ description: BLURB, image: null })
  })

  it('keeps the page that reports a profile out of search engines, and asks the API nothing', async () => {
    const { head, reads } = setup()

    expect(await head(`/profiles/${PROFILE}/report`)).toMatchObject({
      status: 200,
      parts: [],
      noIndex: true,
    })
    expect(reads.profile).not.toHaveBeenCalled()
  })

  it("gives a page's address without the slash at its end", async () => {
    const { head } = setup()

    expect((await head('/conventions/con-a/')).path).toBe('/conventions/con-a')
  })

  it('fails when a read fails, so that the caller decides what a page gets instead', async () => {
    const { head } = setup({ convention: vi.fn().mockRejectedValue(new Error('down')) })

    await expect(head('/conventions/con-a')).rejects.toThrow('down')
  })
})
