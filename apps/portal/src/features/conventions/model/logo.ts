import { type Logo, type LogoVariant } from '@opos/contract'

/** The address a convention's logo is served from, in one of its sizes, without sign-in. */
export const logoUrl = (apiUrl: string, tenantSlug: string, logo: Logo, variant: LogoVariant) =>
  `${apiUrl.replace(/\/+$/, '')}/public/tenants/${tenantSlug}/logo-files/${logo.fileId}/${variant}`

/**
 * The size a logo takes inside a square box of `side` pixels: fitted with its proportions kept and
 * never enlarged, so that the page holds its place before the picture loads.
 */
export function logoBox(logo: Logo, side: number) {
  const scale = Math.min(1, side / logo.width, side / logo.height)
  return {
    width: Math.max(1, Math.round(logo.width * scale)),
    height: Math.max(1, Math.round(logo.height * scale)),
  }
}
