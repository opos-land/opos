import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'

const COMMIT = 'afcc435f75d2b50ee45b1e9cc353302cfead1dbc'

describe('the X-Opos-Commit header', () => {
  it('names the commit the API runs on every response, an error included', async () => {
    const app = await createApp({ OPOS_COMMIT: COMMIT })
    const ok = await request(app.getHttpServer()).get('/health').expect(200)
    expect(ok.headers['x-opos-commit']).toBe(COMMIT)
    const missing = await request(app.getHttpServer()).get('/no-such-route').expect(404)
    expect(missing.headers['x-opos-commit']).toBe(COMMIT)
    await app.close()
  })

  it('says unknown where the deployment names no commit', async () => {
    const app = await createApp({ OPOS_COMMIT: '' })
    const res = await request(app.getHttpServer()).get('/health').expect(200)
    expect(res.headers['x-opos-commit']).toBe('unknown')
    await app.close()
  })

  it('refuses a value that is no name of a commit', async () => {
    await expect(createApp({ OPOS_COMMIT: 'abc\r\nSet-Cookie: x=1' })).rejects.toThrow()
  })
})
