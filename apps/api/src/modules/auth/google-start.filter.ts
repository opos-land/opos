import { type ArgumentsHost, Catch, HttpException, Inject } from '@nestjs/common'
import { applicationSchema } from '@opos/contract'
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter'
import { ENV, type Env } from '../../config/env'
import { googleFailureUrl } from './google-auth.service'

/**
 * `GET /auth/google` is a navigation, so a visitor over a limit, the default one or the one it
 * shares with the auth routes, lands on the login page of the application and not on a JSON body
 * (PLAN.md 7.9). Any other failure, and a query that names no application, answers as on every route.
 */
@Catch()
export class GoogleStartFilter extends HttpExceptionFilter {
  constructor(@Inject(ENV) private readonly env: Env) {
    super()
  }

  override catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp()
    const app = applicationSchema.safeParse(
      http.getRequest<{ query: { app?: unknown } }>().query.app,
    )
    if (app.success && exception instanceof HttpException && exception.getStatus() === 429) {
      http
        .getResponse<{ redirect(status: number, url: string): void }>()
        .redirect(302, googleFailureUrl(app.data, 'auth.over_request_rate_limit', this.env))
      return
    }
    super.catch(exception, host)
  }
}
