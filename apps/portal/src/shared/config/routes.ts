export const PRIVACY_PATH = '/privacy'

/** The platform's terms, linked from registration and from where a profile is published. */
export const TERMS_PATH = '/terms'

/** Where an account changes its profile. */
export const MY_PROFILE_PATH = '/account/profile'

/** The page of a published profile, by the identifier its address holds. */
export const profilePath = (profileId: string) => `/profiles/${profileId}`

/** Where a signed-in user lands when nothing else asked for a page. */
export const SIGNED_IN_HOME = '/account'
