import { type OpenAPIObject } from '@nestjs/swagger'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'

describe('API docs', () => {
  it.each(['test', 'production'] as const)('serves the OpenAPI document in %s', async (nodeEnv) => {
    const app = await createApp({ NODE_ENV: nodeEnv })
    const res = await request(app.getHttpServer()).get('/docs/json').expect(200)
    const doc = res.body as OpenAPIObject
    expect(doc.openapi).toMatch(/^3\./)
    expect(doc.paths['/health']?.get?.operationId).toBe('health.check')
    await request(app.getHttpServer()).get('/docs').expect(200)
    await app.close()
  })

  it('documents the session cookies and no bearer credential', async () => {
    const app = await createApp()
    const res = await request(app.getHttpServer()).get('/docs/json').expect(200)
    const doc = res.body as OpenAPIObject
    await app.close()

    expect(Object.keys(doc.components?.securitySchemes ?? {}).sort()).toEqual([
      'adminSession',
      'panelSession',
      'portalSession',
    ])
    expect(doc.components?.securitySchemes).toMatchObject({
      portalSession: { type: 'apiKey', in: 'cookie', name: 'opos_portal_access' },
      panelSession: { type: 'apiKey', in: 'cookie', name: 'opos_panel_access' },
      adminSession: { type: 'apiKey', in: 'cookie', name: 'opos_admin_access' },
    })
    expect(doc.security).toEqual([{ portalSession: [] }, { panelSession: [] }])
    expect(JSON.stringify(doc)).not.toMatch(/bearer/i)
  })

  it("documents an admin route with the admin application's session alone", async () => {
    const app = await createApp()
    const res = await request(app.getHttpServer()).get('/docs/json').expect(200)
    const doc = res.body as OpenAPIObject
    await app.close()

    const operations = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.values(item as Record<string, { security?: unknown }>).map(
        (operation) => [path, operation.security] as const,
      ),
    )
    const admin = operations.filter(([path]) => path.startsWith('/admin/'))
    expect(admin.length).toBeGreaterThan(0)
    for (const [path, security] of admin) {
      expect(security, path).toEqual([{ adminSession: [] }])
    }
    for (const [path, security] of operations.filter(([path]) => !path.startsWith('/admin/'))) {
      expect(JSON.stringify(security ?? []), path).not.toContain('adminSession')
    }
  })
})
