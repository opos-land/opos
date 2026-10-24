import { type NestExpressApplication } from '@nestjs/platform-express'
import { setupDocs } from './common/docs/setup-docs'
import { type Env } from './config/env'

export async function configureApp(app: NestExpressApplication, env: Env) {
  app.set('trust proxy', 1)
  app.enableCors({
    origin: [env.PANEL_URL, env.PORTAL_URL],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Slug', 'Accept-Language'],
    credentials: false,
  })
  app.enableShutdownHooks()
  await setupDocs(app)
  return app
}
