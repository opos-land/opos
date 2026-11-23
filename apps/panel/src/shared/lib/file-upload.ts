import { type UploadedFile } from '@opos/contract'

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
