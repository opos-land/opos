import { type Env } from '../../config/env'
import { fileTypeRefused, imagesUnavailable } from './errors'
import { type ImgproxyRequest, imgproxyPath, signImgproxyPath } from './imgproxy'
import { sniff } from './sniff'

/** An image imgproxy made, with its size read from its header. */
export interface MadeImage {
  bytes: Uint8Array
  width: number
  height: number
}

/**
 * imgproxy, which the API alone reaches with requests it signed (docs/specs/0013-image-variants.md).
 * An image it cannot read is `file.type-refused`; it out of reach, `images.unavailable`. The
 * address it reads from never reaches a log.
 */
export class ImageServer {
  constructor(
    private readonly env: Pick<Env, 'IMGPROXY_URL' | 'IMGPROXY_KEY' | 'IMGPROXY_SALT'>,
    private readonly timeoutMs = 30_000,
  ) {}

  async make(source: string, request: ImgproxyRequest): Promise<MadeImage> {
    const path = imgproxyPath(request, source)
    const signature = signImgproxyPath(this.env.IMGPROXY_KEY, this.env.IMGPROXY_SALT, path)
    let response: Response
    try {
      response = await fetch(`${this.env.IMGPROXY_URL.replace(/\/+$/, '')}/${signature}${path}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw imagesUnavailable(error instanceof Error ? error.name : 'unreachable')
    }
    // 422 for a source it cannot read as an image, 500 for one whose processing failed: either
    // way the image, not the server, is at fault.
    if (response.status === 422 || response.status === 500) throw fileTypeRefused()
    if (!response.ok) throw imagesUnavailable(`imgproxy answered ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const made = sniff(bytes)
    if (!made?.width || !made.height) throw imagesUnavailable('imgproxy answered no image')
    return { bytes, width: made.width, height: made.height }
  }
}
