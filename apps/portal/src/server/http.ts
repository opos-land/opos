import { createServer, type ServerResponse } from 'node:http'

/** The document of the page at a path, and the status the page answers with. */
export type Documents = (pathname: string) => Promise<{ status: number; html: string }>

function answer(
  response: ServerResponse,
  status: number,
  type: string,
  body: string,
  head = false,
) {
  response.writeHead(status, {
    'content-type': `${type}; charset=utf-8`,
    'content-length': Buffer.byteLength(body),
    // A document is asked for again every time: its head follows what the convention changed
    'cache-control': 'no-cache',
  })
  response.end(head ? undefined : body)
}

/**
 * The path of what a request asks for, without what follows it. A request names a path, so it is
 * read as one even where it opens with two slashes, which would else pass for the name of a host;
 * null for a request that names anything else.
 */
function pathOf(target: string | undefined) {
  if (!target?.startsWith('/')) return null
  try {
    return new URL(`http://portal.invalid${target}`).pathname
  } catch {
    return null
  }
}

/**
 * Serves the documents of the portal's pages and nothing else: the built files, the security
 * headers and the access to a guarded environment stay with the web server in front, which asks
 * here for a page and falls back to the plain document when no answer comes.
 */
export function createHeadServer(documents: Documents, report: (error: unknown) => void) {
  return createServer((request, response) => {
    const head = request.method === 'HEAD'
    if (request.method !== 'GET' && !head) {
      response.writeHead(405, { allow: 'GET, HEAD' }).end()
      return
    }
    const pathname = pathOf(request.url)
    if (pathname === null) {
      answer(response, 400, 'text/plain', 'The address cannot be read', head)
      return
    }
    if (pathname === '/healthz') {
      answer(response, 200, 'text/plain', 'ok', head)
      return
    }
    documents(pathname).then(
      ({ status, html }) => answer(response, status, 'text/html', html, head),
      (error: unknown) => {
        report(error)
        answer(response, 500, 'text/plain', 'The document could not be made', head)
      },
    )
  })
}
