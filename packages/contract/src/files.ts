import { z } from 'zod'

/**
 * The types the storage keeps (docs/specs/0012-file-storage.md): inert ones alone. A kind of file
 * narrows them, never widens them.
 */
export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const

export type FileType = (typeof FILE_TYPES)[number]

/** The largest file the storage keeps, in bytes. */
export const MAX_FILE_SIZE = 15 * 1024 * 1024

/** The base64 of a file of MAX_FILE_SIZE bytes. */
const MAX_FILE_BASE64 = Math.ceil(MAX_FILE_SIZE / 3) * 4

/**
 * The JSON body a route that takes a file accepts, in bytes: the file as base64 and the rest of its
 * form. Every other route keeps the default limit.
 */
export const MAX_UPLOAD_BODY = 21 * 1024 * 1024

/**
 * A file in a JSON body: the name it was chosen under, the type the browser declares and its bytes
 * in base64. The storage checks the bytes against the type before it keeps anything.
 */
export const uploadedFileSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  type: z.enum(FILE_TYPES),
  data: z.base64().min(1).max(MAX_FILE_BASE64),
})

export type UploadedFile = z.infer<typeof uploadedFileSchema>

/**
 * A kept file as a feature answers it beside its own row: what a page needs to show it or offer
 * it, an image's width and height so that the page keeps its place before it loads.
 */
export const storedFileSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(FILE_TYPES),
  size: z.number().int().positive(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
})

export type StoredFile = z.infer<typeof storedFileSchema>
