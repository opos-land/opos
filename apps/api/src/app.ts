import { type NestApplicationOptions } from '@nestjs/common'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { setupDocs } from './common/docs/setup-docs'
import { applicationFromOrigin, requireOriginForSession } from './common/http/application'
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
  app.use(requireOriginForSession(env))
  // The credentials header goes out for the two origins only: `cors` sets it for any request when
  // `credentials` is fixed, so the options are chosen per request.
  app.enableCors((req, callback) => {
    const allowed =
      applicationFromOrigin((req as { headers: { origin?: unknown } }).headers.origin, env) !== null
    callback(null, {
      origin: allowed ? [new URL(env.PANEL_URL).origin, new URL(env.PORTAL_URL).origin] : false,
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Slug', 'Accept-Language'],
      // Not CORS-safelisted: without this the panel and portal cannot read it on a 429.
      exposedHeaders: ['Retry-After'],
      // The session travels in the API's cookies, for these two origins only (PLAN.md 7.8).
      credentials: allowed,
    })
  })
  app.enableShutdownHooks()
  await setupDocs(app)
  return app
}
