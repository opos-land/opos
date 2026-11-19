import { MAX_UPLOAD_BODY, tenantRoute } from '@opos/contract'
import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { uploadRoutes, uploadBodyParser } from './upload-body'

const contract = {
  pictures: {
    add: tenantRoute
      .meta({ takesFile: true })
      .route({ method: 'POST', path: '/editions/{editionId}/pictures' })
      .input(z.object({ params: z.object({ editionId: z.uuid() }) })),
    list: tenantRoute.route({ method: 'GET', path: '/editions/{editionId}/pictures' }),
  },
  other: tenantRoute.route({ method: 'POST', path: '/other' }),
}

/** An app with the upload parser, then the default JSON parser, echoing the body's size. */
function app() {
  const server = express()
  server.use(uploadBodyParser(contract))
  server.use(express.json())
  server.post(/.*/, (req, res) => {
    res.json({ length: JSON.stringify(req.body).length })
  })
  server.use(
    (
      error: { status?: number; code?: string },
      _req: unknown,
      res: express.Response,
      _next: unknown,
    ) => {
      res.status(error.status ?? 500).json({ code: error.code ?? 'other' })
    },
  )
  return server
}

const body = (bytes: number) => ({ file: { data: 'A'.repeat(bytes) } })

describe('uploadRoutes', () => {
  it('finds the routes of the contract that take a file', () => {
    expect(uploadRoutes(contract)).toEqual([
      { method: 'POST', path: '/editions/:editionId/pictures' },
    ])
  })
})

describe('uploadBodyParser', () => {
  it('takes a JSON body of a file of 15 MB on a route that takes a file', async () => {
    const response = await request(app())
      .post('/editions/7a1e6b56-2c3f-4d55-9a2e-1f0b7c3d9e10/pictures')
      .send(body(Math.ceil((15 * 1024 * 1024) / 3) * 4))
    expect(response.status).toBe(200)
  })

  it('refuses a body above its limit on a route that takes a file as a file too large', async () => {
    const response = await request(app())
      .post('/editions/7a1e6b56-2c3f-4d55-9a2e-1f0b7c3d9e10/pictures')
      .send(body(MAX_UPLOAD_BODY + 1))
    expect(response.status).toBe(413)
    expect(response.body).toEqual({ code: 'file.too-large' })
  })

  it('leaves every other route its default limit', async () => {
    const response = await request(app())
      .post('/other')
      .send(body(200 * 1024))
    expect(response.status).toBe(413)
    expect(response.body).toEqual({ code: 'other' })
  })
})
