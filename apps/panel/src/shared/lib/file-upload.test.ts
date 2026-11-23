import { describe, expect, it } from 'vitest'
import { toUpload } from './file-upload'

describe('toUpload', () => {
  it('carries the name, the type and the bytes of the file as base64', async () => {
    const picture = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff])], 'My logo.png', {
      type: 'image/png',
    })

    expect(await toUpload(picture)).toEqual({
      name: 'My logo.png',
      type: 'image/png',
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff]).toString('base64'),
    })
  })
})
