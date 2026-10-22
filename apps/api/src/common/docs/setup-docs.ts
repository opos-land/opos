import { type INestApplication, Logger } from '@nestjs/common'
import { type OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { contract } from '@opos/contract'
import { generateOpenApi } from '@ts-rest/open-api'

export function createOpenApiDocument(): OpenAPIObject {
  return generateOpenApi(
    contract,
    { info: { title: 'OPOS API', version: '0.0.0' } },
    { setOperationId: 'concatenated-path' },
  )
}

export function setupDocs(app: INestApplication) {
  SwaggerModule.setup('docs', app, createOpenApiDocument(), { jsonDocumentUrl: 'docs/json' })
  new Logger('ApiDocs').log('API docs at /docs, OpenAPI document at /docs/json')
}
