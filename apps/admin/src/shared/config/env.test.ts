import { describe, expect, it } from 'vitest'
import { env } from './env'
import source from './env.ts?raw'

describe('env', () => {
  it('reads the address of the API', () => {
    expect(() => new URL(env.VITE_API_URL)).not.toThrow()
  })

  // Vite inlines what the source names, and `import.meta.env` whole is every VITE_* variable there is.
  it('names each variable it reads, so that no other VITE_* variable enters the bundle', () => {
    expect(source).toContain('import.meta.env.VITE_API_URL')
    expect(source).not.toMatch(/import\.meta\.env(?!\.)/)
  })
})
