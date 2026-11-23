import { describe, expect, it } from 'vitest'
import { imgproxyPath, masterRequest, signImgproxyPath, variantRequest } from './imgproxy'

describe('signImgproxyPath', () => {
  // The example of imgproxy's documentation, Signing a URL.
  it('signs a path with the key and the salt as imgproxy checks it', () => {
    const key = Buffer.from('736563726574', 'hex')
    const salt = Buffer.from('68656C6C6F', 'hex')
    const path =
      '/rs:fill:300:400:0/g:sm/aHR0cDovL2V4YW1w/bGUuY29tL2ltYWdl/cy9jdXJpb3NpdHku/anBn.png'

    expect(signImgproxyPath(key, salt, path)).toBe('oKfUtW34Dvo2BGQehJFR4Nr0_rIjOtdtzJ3QFsUcXH8')
  })
})

describe('the requests the API makes of imgproxy', () => {
  it('asks for a master in the format the image came in, upright, cleaned and within 4096', () => {
    for (const [type, extension] of [
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
      ['image/webp', 'webp'],
    ] as const) {
      expect(masterRequest(type)).toEqual({
        options: 'rs:fit:4096:4096:0/ar:1/sm:1/kcr:0/scp:1',
        extension,
      })
    }
  })

  it('asks for a variant as WebP, fitted inside its box or cropped from the middle, never enlarged', () => {
    expect(variantRequest({ width: 1600, height: 1200, fit: 'inside' })).toEqual({
      options: 'rs:fit:1600:1200:0/sm:1/kcr:0/scp:1',
      extension: 'webp',
    })
    expect(variantRequest({ width: 160, height: 160, fit: 'cover' })).toEqual({
      options: 'rs:fill-down:160:160:0/g:ce/sm:1/kcr:0/scp:1',
      extension: 'webp',
    })
  })

  it('puts the source in the path as URL-safe base64, never as plain text', () => {
    const source = 'http://s3:7070/opos/tenants/a/b/upload?X-Amz-Signature=secret'
    const path = imgproxyPath({ options: 'rs:fit:10:10:0', extension: 'webp' }, source)

    expect(path).toBe(`/rs:fit:10:10:0/${Buffer.from(source).toString('base64url')}.webp`)
    expect(path).not.toContain('X-Amz')
  })
})
