import { describe, expect, it } from 'vitest'
import { fileNameOf } from './save-file'

describe('fileNameOf', () => {
  it('reads the name a file is served under', () => {
    expect(
      fileNameOf({ 'content-disposition': 'attachment; filename="production-numbers-2026.csv"' }),
    ).toBe('production-numbers-2026.csv')
  })

  it('is undefined for a file served under no name', () => {
    expect(fileNameOf({})).toBeUndefined()
    expect(fileNameOf({ 'content-disposition': 'inline' })).toBeUndefined()
  })
})
