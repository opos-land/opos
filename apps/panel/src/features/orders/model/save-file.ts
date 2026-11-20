/** The name a file is served under, from its `content-disposition`; undefined where it has none. */
export const fileNameOf = (headers: Record<string, string>): string | undefined =>
  /filename="([^"]+)"/.exec(headers['content-disposition'] ?? '')?.[1]

/** Hands a file read with the member's session to the browser, to save under a name. */
export function saveFile(name: string, body: Blob) {
  const url = URL.createObjectURL(body)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
