interface Request {
  headers: Record<string, string | string[] | undefined>
}

interface Response {
  status(code: number): { json(body: unknown): void }
}

/**
 * A request body must be JSON (PLAN.md 5). Express parses JSON before routing, within its size
 * limit; any other body oRPC would read from the stream itself, with no limit, inside the tenant
 * transaction. The headers decide, so the body is never read.
 */
export function requireJsonBody(req: Request, res: Response, next: () => void) {
  const length = Number(req.headers['content-length'] ?? 0)
  const hasBody = req.headers['transfer-encoding'] !== undefined || length > 0
  const type = String(req.headers['content-type'] ?? '')
  if (hasBody && !/^application\/json\b/i.test(type)) {
    res.status(415).json({
      code: 'request.invalid',
      message: 'A request body must be application/json',
    })
    return
  }
  next()
}
