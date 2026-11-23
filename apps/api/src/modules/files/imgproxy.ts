import { createHmac } from 'node:crypto'
import { type FileType } from '@opos/contract'
import { MAX_IMAGE_SIDE, type VariantDeclaration } from './kinds'

/** What one request asks of imgproxy: its processing options and the format it answers in. */
export interface ImgproxyRequest {
  options: string
  extension: 'jpg' | 'png' | 'webp'
}

/** No metadata, copyright fields included, and the colour profile turned into sRGB and removed. */
const CLEANED = 'sm:1/kcr:0/scp:1'

const EXTENSION: Record<Exclude<FileType, 'application/pdf'>, ImgproxyRequest['extension']> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * The master of an image: the format it came in, upright, cleaned, its longer side within 4096 and
 * never enlarged (docs/specs/0013-image-variants.md, M1 to M3).
 */
export const masterRequest = (type: Exclude<FileType, 'application/pdf'>): ImgproxyRequest => ({
  options: `rs:fit:${MAX_IMAGE_SIDE}:${MAX_IMAGE_SIDE}:0/ar:1/${CLEANED}`,
  extension: EXTENSION[type],
})

/** A variant, as WebP: fitted inside its box, or cropped from the middle; never enlarged. */
export const variantRequest = ({ width, height, fit }: VariantDeclaration): ImgproxyRequest => ({
  options:
    fit === 'inside'
      ? `rs:fit:${width}:${height}:0/${CLEANED}`
      : `rs:fill-down:${width}:${height}:0/g:ce/${CLEANED}`,
  extension: 'webp',
})

/** The path imgproxy reads: the options, then the source in URL-safe base64, then the format. */
export const imgproxyPath = (request: ImgproxyRequest, source: string) =>
  `/${request.options}/${Buffer.from(source).toString('base64url')}.${request.extension}`

/** The signature imgproxy checks: HMAC-SHA256 of the salt and the path, URL-safe base64. */
export const signImgproxyPath = (key: Buffer, salt: Buffer, path: string) =>
  createHmac('sha256', key).update(salt).update(path).digest('base64url')
