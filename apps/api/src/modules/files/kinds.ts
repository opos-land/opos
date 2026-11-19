import {
  DOCUMENT_TYPES,
  FILE_TYPES,
  type FileType,
  LOGO_TYPES,
  type LogoVariant,
  MAX_DOCUMENT_SIZE,
  MAX_FILE_SIZE,
  MAX_LOGO_SIZE,
} from '@opos/contract'
import { editionDocumentVersions, tenantLogos } from '@opos/db'
import { type AnyPgColumn } from 'drizzle-orm/pg-core'

/** Who a file belongs to: the short list the core holds (docs/specs/0012-file-storage.md, D1). */
export type FileOwner = 'account' | 'convention' | 'edition'

/** A size a feature shows an image in (docs/specs/0013-image-variants.md, V1). */
export interface VariantDeclaration {
  /** The box, in pixels. */
  width: number
  height: number
  /** Fitted inside the box, or cropped from the middle to fill it. */
  fit: 'inside' | 'cover'
  /** Made with the upload, for a size a page shows first; else made by its first read. */
  withUpload?: boolean
}

/** A kind of file a feature takes, declared in its spec and registered here. */
export interface FileKind {
  /** Lowercase words joined by hyphens; it names the kind in the file's row. */
  name: string
  owner: FileOwner
  /** Among the types the storage keeps. */
  types: readonly FileType[]
  /** In bytes, below the storage's own 15 MB. */
  maxSize?: number
  /** The column of the feature's own table that points at the file: what the file is kept for. */
  pointer: AnyPgColumn
  /** Its variants, by name, when it takes images. */
  variants?: Readonly<Record<string, VariantDeclaration>>
}

export const MAX_VARIANTS = 8
/** The longer side of a master, and the largest box of a variant. */
export const MAX_IMAGE_SIDE = 4096
/** The names the storage gives its own objects, which no variant takes. */
export const OBJECT_NAMES = ['file', 'master', 'upload'] as const

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const isImageType = (type: FileType) => type !== 'application/pdf'

/** Checks every declaration and holds the kinds by name; a wrong one stops the API on start. */
export function defineKinds(kinds: readonly FileKind[]): ReadonlyMap<string, FileKind> {
  const byName = new Map<string, FileKind>()
  for (const kind of kinds) {
    const fail = (why: string): never => {
      throw new Error(`The kind of file ${kind.name}: ${why}`)
    }
    if (!NAME.test(kind.name)) fail('its name is not lowercase words joined by hyphens')
    if (byName.has(kind.name)) fail('another kind has its name')
    if (kind.types.length === 0) fail('it takes no type')
    for (const type of kind.types) {
      if (!FILE_TYPES.includes(type)) fail(`the storage does not keep ${type}`)
    }
    if (kind.maxSize !== undefined && !(kind.maxSize > 0 && kind.maxSize <= MAX_FILE_SIZE)) {
      fail('its limit is not between 1 byte and 15 MB')
    }
    const variants = Object.entries(kind.variants ?? {})
    const images = kind.types.some(isImageType)
    if (!images && variants.length > 0) fail('it takes no image, so it has no variants')
    if (images && variants.length === 0) fail('it takes images, so it declares their variants')
    if (variants.length > MAX_VARIANTS) fail(`it has more than ${MAX_VARIANTS} variants`)
    for (const [name, variant] of variants) {
      if (!NAME.test(name) || (OBJECT_NAMES as readonly string[]).includes(name)) {
        fail(`its variant ${name} has a name the storage cannot give it`)
      }
      for (const side of [variant.width, variant.height]) {
        if (!Number.isInteger(side) || side < 1 || side > MAX_IMAGE_SIDE) {
          fail(`its variant ${name} is not between 1 and ${MAX_IMAGE_SIDE} pixels a side`)
        }
      }
    }
    byName.set(kind.name, kind)
  }
  return byName
}

/**
 * The kinds the features declared. A feature that starts to take files adds its kind here and a
 * column to a table of its own; the storage does not change with it.
 */
export const FILE_KINDS: readonly FileKind[] = [
  // A convention's logo (docs/specs/0014-edition-list-and-edition-page.md): small in a row of the
  // list of editions, which a page shows first, and large on the convention's and an edition's
  // page.
  {
    name: 'convention-logo',
    owner: 'convention',
    types: LOGO_TYPES,
    maxSize: MAX_LOGO_SIZE,
    pointer: tenantLogos.fileId,
    variants: {
      small: { width: 96, height: 96, fit: 'inside', withUpload: true },
      large: { width: 320, height: 320, fit: 'inside' },
    } satisfies Record<LogoVariant, VariantDeclaration>,
  },
  // A version of an edition's legal document (docs/specs/0002-shop-setup.md): a PDF published
  // once, which anyone downloads by the version's address.
  {
    name: 'edition-document',
    owner: 'edition',
    types: DOCUMENT_TYPES,
    maxSize: MAX_DOCUMENT_SIZE,
    pointer: editionDocumentVersions.fileId,
  },
]

/** The kind of a convention's logo. */
export const LOGO_KIND = 'convention-logo'

/** The kind of a version of an edition's legal document. */
export const DOCUMENT_KIND = 'edition-document'
