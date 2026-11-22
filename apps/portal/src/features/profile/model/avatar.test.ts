import { describe, expect, it } from 'vitest'
import { avatarUrl, isAvatarFile, MAX_AVATAR_MB } from './avatar'

// docs/specs/0016-public-profile.md, A2 and A3.
describe('avatarUrl', () => {
  it('is the public address of a size of the avatar, by the identifier of its file', () => {
    const avatar = { fileId: '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60' }

    expect(avatarUrl('https://api.example.test/', avatar, 'large')).toBe(
      'https://api.example.test/public/avatar-files/0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60/large',
    )
    expect(avatarUrl('https://api.example.test', avatar, 'small')).toBe(
      'https://api.example.test/public/avatar-files/0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60/small',
    )
  })
})

describe('isAvatarFile', () => {
  const file = (type: string, size: number) => ({ type, size })

  it('takes a JPEG, a PNG and a WebP of up to 5 MB', () => {
    expect(MAX_AVATAR_MB).toBe(5)
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(isAvatarFile(file(type, 5 * 1024 * 1024))).toBe('ok')
    }
  })

  it('tells a file of another type from one that is too large', () => {
    expect(isAvatarFile(file('image/gif', 10))).toBe('type')
    expect(isAvatarFile(file('application/pdf', 10))).toBe('type')
    expect(isAvatarFile(file('image/png', 5 * 1024 * 1024 + 1))).toBe('size')
  })
})
