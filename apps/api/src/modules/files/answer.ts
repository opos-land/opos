import { type FileType } from '@opos/contract'

/** A kept file as the storage opened it. */
export interface OpenedFile {
  type: FileType
  name: string
  size: number
  sha256: string
  bytes: Uint8Array
}

/** The headers of a file served from the API's own origin (docs/specs/0012-file-storage.md). */
export interface FileAnswer {
  headers: Record<string, string>
  body: Blob
}

const disposition = (kind: 'inline' | 'attachment', name: string) => {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '\\$&')
  const utf8 = encodeURIComponent(name.replace(/[\r\n]/g, ' ')).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${kind}; filename="${ascii}"; filename*=utf-8''${utf8}`
}

/**
 * The answer of a route that serves a file: the stored type and nothing a browser could run or
 * guess at, an image shown and a PDF downloaded under its name, kept from other sites' pages; a
 * file for everyone cached for good, since it never changes, and any other cached nowhere.
 */
export function answerFile(
  file: OpenedFile,
  { forEveryone }: { forEveryone: boolean },
): FileAnswer {
  return {
    headers: {
      'content-disposition': disposition(
        file.type === 'application/pdf' ? 'attachment' : 'inline',
        file.name,
      ),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-site',
      'cache-control': forEveryone ? 'public, max-age=31536000, immutable' : 'private, no-store',
      etag: `"${file.sha256}"`,
    },
    body: new Blob([file.bytes], { type: file.type }),
  }
}
