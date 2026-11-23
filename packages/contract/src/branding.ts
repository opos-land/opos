import { z } from 'zod'
import { tenantRoute } from './common'
import { type FileType, uploadedFileSchema } from './files'

/** The types a logo is taken in: images alone, among those the storage keeps. */
export const LOGO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const satisfies readonly FileType[]

/** The largest logo, in bytes. */
export const MAX_LOGO_SIZE = 2 * 1024 * 1024

/** The sizes a logo is served in: for a row of the list of editions, and for a page. */
export const LOGO_VARIANTS = ['small', 'large'] as const

export type LogoVariant = (typeof LOGO_VARIANTS)[number]

/**
 * A convention's logo as a page shows it: the file its address names, and the width and height of
 * the picture, whose proportions every variant keeps, so that a page holds its place before it
 * loads.
 */
export const logoSchema = z.object({
  fileId: z.uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export type Logo = z.infer<typeof logoSchema>

export const brandingSchema = z.object({ logo: logoSchema.nullable() })

export type Branding = z.infer<typeof brandingSchema>

export const putLogoSchema = z.strictObject({ file: uploadedFileSchema })

export const brandingContract = {
  get: tenantRoute
    .route({
      method: 'GET',
      path: '/branding',
      summary: "The convention's logo; needs branding>=read",
    })
    .output(brandingSchema),
  putLogo: tenantRoute
    .meta({ takesFile: true })
    .route({
      method: 'PUT',
      path: '/branding/logo',
      summary: "Set the convention's logo, in place of the one it had; needs branding=write",
    })
    .input(z.object({ body: putLogoSchema }))
    .output(brandingSchema),
  removeLogo: tenantRoute.route({
    method: 'DELETE',
    path: '/branding/logo',
    successStatus: 204,
    summary: "Remove the convention's logo; needs branding=write",
  }),
}
