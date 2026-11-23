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

  // A router answers OPTIONS itself for a path it holds a route of: the preflight of an upload
  // would end there, before CORS says who may send it.
  it('leaves the preflight of a route that takes a file to what follows', async () => {
    const server = express()
    server.use(uploadBodyParser(contract))
    server.options(/.*/, (_req, res) => {
      res.set('x-answered-by', 'cors').sendStatus(204)
    })

    const response = await request(server).options(
      '/editions/7a1e6b56-2c3f-4d55-9a2e-1f0b7c3d9e10/pictures',
    )

    expect(response.status).toBe(204)
    expect(response.headers['x-answered-by']).toBe('cors')
  })

  it('parses no body of another method on the path of a route that takes a file', async () => {
    const server = express()
    server.use(uploadBodyParser(contract))
    server.get(/.*/, (req, res) => {
      res.json({ parsed: req.body !== undefined })
    })

    const response = await request(server).get(
      '/editions/7a1e6b56-2c3f-4d55-9a2e-1f0b7c3d9e10/pictures',
    )

    expect(response.body).toEqual({ parsed: false })
  })

  it('leaves every other route its default limit', async () => {
    const response = await request(app())
      .post('/other')
      .send(body(200 * 1024))
    expect(response.status).toBe(413)
    expect(response.body).toEqual({ code: 'other' })
  })
})
