// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readEnv } from './env'

const env = {
  PORTAL_URL: 'https://opos.example',
  API_URL: 'https://api.opos.example',
}

describe('readEnv', () => {
  it("reads the portal's origin, the API's address and the defaults", () => {
    expect(readEnv(env)).toEqual({
      port: 8081,
      origin: 'https://opos.example',
      apiUrl: 'https://api.opos.example',
      internalApiUrl: 'https://api.opos.example',
      indexHtml: 'index.html',
    })
  })

  it('reads the port, the address it reaches the API at and where the document lies', () => {
    expect(
      readEnv({
        ...env,
        PORT: '9000',
        API_INTERNAL_URL: 'http://api:3001',
        INDEX_HTML: '/srv/index.html',
      }),
    ).toMatchObject({ port: 9000, internalApiUrl: 'http://api:3001', indexHtml: '/srv/index.html' })
  })

  it("keeps the origin alone of the portal's address", () => {
    expect(readEnv({ ...env, PORTAL_URL: 'https://opos.example/some/path?x=1' }).origin).toBe(
      'https://opos.example',
    )
  })

  it('takes an empty value for one that is not set', () => {
    expect(readEnv({ ...env, PORT: '', API_INTERNAL_URL: '' })).toMatchObject({
      port: 8081,
      internalApiUrl: 'https://api.opos.example',
    })
  })

  it('refuses an environment that lacks an address or holds no address, and names it', () => {
    expect(() => readEnv({ API_URL: env.API_URL })).toThrow(/Invalid environment.*PORTAL_URL/s)
    expect(() => readEnv({ ...env, API_URL: 'not an address' })).toThrow(/API_URL/)
    expect(() => readEnv({ ...env, PORT: '70000' })).toThrow(/PORT/)
  })
})
