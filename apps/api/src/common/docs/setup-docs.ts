import { type INestApplication, Logger } from '@nestjs/common'
import { type OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { contract } from '@opos/contract'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'

/** The OpenAPI document of the contract; `operationId` is the router path, e.g. `health.check`. */
export async function createOpenApiDocument(): Promise<OpenAPIObject> {
  const document = await new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  }).generate(contract, {
    info: { title: 'OPOS API', version: '0.0.0' },
    components: {
      securitySchemes: {
        portalSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'opos_portal_access',
          description:
            'The portal session, set by POST /auth/sign-in with the Origin of the portal',
        },
        panelSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'opos_panel_access',
          description: 'The panel session, set by POST /auth/sign-in with the Origin of the panel',
        },
        adminSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'opos_admin_access',
          description:
            'The admin application session, set by POST /auth/sign-in with its Origin; the admin routes take no other',
        },
      },
    },
    security: [{ portalSession: [] }, { panelSession: [] }],
  })
  return document as OpenAPIObject
}

export async function setupDocs(app: INestApplication) {
  SwaggerModule.setup('docs', app, await createOpenApiDocument(), { jsonDocumentUrl: 'docs/json' })
  new Logger('ApiDocs').log('API docs at /docs, OpenAPI document at /docs/json')
}
