import { type Logo, type LogoVariant } from '@opos/contract'
import { env } from '../../../shared/config/env'
import { logoBox, logoUrl } from '../model/logo'

/** The sides of the boxes a logo is shown in, in pixels: in a row of a list, and on a page. */
const SIDES = { small: 48, large: 160 } as const satisfies Record<LogoVariant, number>

/**
 * A convention's logo; a convention with no logo shows none. It always stands beside words that
 * say whose it is, the convention's name or an edition's that holds it, so the picture itself adds
 * nothing to read.
 */
export function ConventionLogo({
  tenantSlug,
  logo,
  variant,
}: {
  tenantSlug: string
  logo: Logo | null
  variant: LogoVariant
}) {
  if (!logo) return null
  return (
    <img
      src={logoUrl(env.VITE_API_URL, tenantSlug, logo, variant)}
      {...logoBox(logo, SIDES[variant])}
      alt=""
      loading="lazy"
      decoding="async"
      className="shrink-0"
    />
  )
}
