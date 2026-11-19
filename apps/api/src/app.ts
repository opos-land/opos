import { type NestApplicationOptions } from '@nestjs/common'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { contract } from '@opos/contract'
import { setupDocs } from './common/docs/setup-docs'
import {
  applicationFromOrigin,
  applicationOrigins,
  requireOriginForSession,
  restrictAdminOrigin,
} from './common/http/application'
import { requireJsonBody } from './common/json-body'
import { type Env } from './config/env'
import { uploadBodyParser } from './modules/files/upload-body'

/** Options for creating the application, in main.ts and in the tests alike. */
export const APP_OPTIONS = {
  // The send-email hook verifies its signature over the exact bytes Supabase Auth sent.
  rawBody: true,
} satisfies NestApplicationOptions

export async function configureApp(app: NestExpressApplication, env: Env) {
  app.set('trust proxy', 1)
  // Every response depends on the Origin whether or not CORS names it, and `cors` varies only for the
  // origins it allows.
  app.use((_req: unknown, res: { vary(field: string): unknown }, next: () => void) => {
    res.vary('Origin')
    next()
  })
  app.use(requireJsonBody)
  // Before Nest's own parser, which leaves a body already parsed alone.
  app.use(uploadBodyParser(contract))
  app.use(requireOriginForSession(env))
  app.use(restrictAdminOrigin(env))
  // The credentials header goes out for the applications' origins only: `cors` sets it for any
  // request when `credentials` is fixed, so the options are chosen per request.
  app.enableCors((req, callback) => {
    const allowed =
      applicationFromOrigin((req as { headers: { origin?: unknown } }).headers.origin, env) !== null
    callback(null, {
      origin: allowed ? applicationOrigins(env) : false,
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Tenant-Slug',
        'Accept-Language',
        // The result token of an order, which travels in no path and no query.
        'X-Result-Token',
      ],
      // Not CORS-safelisted: without this an application cannot read it on a 429.
      exposedHeaders: ['Retry-After'],
      // The session travels in the API's cookies, for these origins only.
      credentials: allowed,
    })
  })
  app.enableShutdownHooks()
  await setupDocs(app)
  return app
}
