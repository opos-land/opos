import { afterEach, describe, expect, it } from 'vitest'
import { dropServerHeadOnLeaving, SERVER_HEAD } from './server-head'

type Listener = (state: { location: { pathname: string } }) => void

/** A router as far as the head follows it: where it is, and who hears when that changes. */
function fakeRouter(pathname: string) {
  const listeners = new Set<Listener>()
  return {
    state: { location: { pathname } },
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    go(next: string) {
      listeners.forEach((listener) => listener({ location: { pathname: next } }))
    },
    listeners,
  }
}

function serverTag(name: string) {
  const meta = document.createElement('meta')
  meta.name = name
  meta.setAttribute(SERVER_HEAD, '')
  document.head.append(meta)
  return meta
}

afterEach(() => {
  document.head.innerHTML = ''
})

describe('dropServerHeadOnLeaving', () => {
  it('keeps what the server wrote while the portal shows the address the document opened at', () => {
    const router = fakeRouter('/conventions/a')
    const description = serverTag('description')
    dropServerHeadOnLeaving(router)

    router.go('/conventions/a')

    expect(description.isConnected).toBe(true)
  })

  it('drops it once the portal shows another address, so nothing names the page left', () => {
    const router = fakeRouter('/conventions/a')
    const description = serverTag('description')
    const robots = serverTag('robots')
    dropServerHeadOnLeaving(router)

    router.go('/conventions/a/2027')

    expect(description.isConnected).toBe(false)
    expect(robots.isConnected).toBe(false)
  })

  it('leaves what the portal itself put into the head', () => {
    const router = fakeRouter('/profiles/1')
    const own = document.createElement('meta')
    own.name = 'robots'
    document.head.append(own)
    serverTag('description')
    dropServerHeadOnLeaving(router)

    router.go('/')

    expect(own.isConnected).toBe(true)
  })

  it('stops listening after it dropped the head', () => {
    const router = fakeRouter('/')
    dropServerHeadOnLeaving(router)

    router.go('/login')

    expect(router.listeners.size).toBe(0)
  })
})
