import {
  type Logo,
  LOGO_TYPES,
  type LogoVariant,
  MAX_LOGO_SIZE,
  type UploadedFile,
} from '@opos/contract'

/**
 * Why a chosen file cannot be a logo, told beside the field before anything is sent: its type, or
 * its size. The API checks both again, against the bytes.
 */
export function logoProblem(file: File): 'type' | 'size' | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size > MAX_LOGO_SIZE) return 'size'
  return null
}

/** The file as a route that takes one carries it: its name, its type and its bytes in base64. */
export function toUpload(file: File): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read'))
    reader.onload = () => {
      // A data URL: everything after its first comma is the base64 of the bytes.
      const url = reader.result as string
      resolve({
        name: file.name,
        type: file.type as UploadedFile['type'],
        data: url.slice(url.indexOf(',') + 1),
      })
    }
    reader.readAsDataURL(file)
  })
}

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
