import { matchRoutes, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import { router } from '../app/router'
import { matchRoute, ROUTE_PATHS } from './routes'

// The server names a page by its address, so it has to know every address the portal routes
// (docs/ARCHITECTURE.md, Frontends).

const leaves = (routes: readonly RouteObject[]): string[] =>
  routes.flatMap((route) => (route.children ? leaves(route.children) : [route.path ?? '']))

const routed = leaves(router.routes).filter((path) => path !== '*')

/** An address the route answers, with a value in place of each part that varies. */
const sample = (path: string) => path.replace(/:\w+/g, 'value-1')

describe('the routes the server knows', () => {
  it('are found', () => {
    expect(routed.length).toBeGreaterThan(0)
  })

  it("are the portal's own, every one of them and no other", () => {
    expect([...ROUTE_PATHS].sort()).toEqual([...routed].sort())
  })

  it.each(routed)('%s is matched as the portal matches it', (path) => {
    const address = sample(path)
    const matched = matchRoutes([...router.routes], address)?.at(-1)?.route.path

    expect(matched).toBe(path)
    expect(matchRoute(address)?.path).toBe(matched)
  })

  it('know no address the portal does not route', () => {
    expect(matchRoutes([...router.routes], '/nowhere/at/all')?.at(-1)?.route.path).toBe('*')
    expect(matchRoute('/nowhere/at/all')).toBeNull()
  })
})
