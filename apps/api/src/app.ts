import { type NestApplicationOptions } from '@nestjs/common'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { setupDocs } from './common/docs/setup-docs'
import { requireJsonBody } from './common/json-body'
import { type Env } from './config/env'

/** Options for creating the application, in main.ts and in the tests alike. */
export const APP_OPTIONS = {
  // The send-email hook verifies its signature over the exact bytes Supabase Auth sent.
  rawBody: true,
} satisfies NestApplicationOptions

export async function configureApp(app: NestExpressApplication, env: Env) {
  app.set('trust proxy', 1)
  app.use(requireJsonBody)
  app.enableCors({
    origin: [env.PANEL_URL, env.PORTAL_URL],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Slug', 'Accept-Language'],
    credentials: false,
  })
  app.enableShutdownHooks()
  await setupDocs(app)
  return app
}
