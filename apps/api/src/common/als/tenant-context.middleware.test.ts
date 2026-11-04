import { describe, expect, it } from 'vitest'
import { TenantContextMiddleware } from './tenant-context.middleware'
import { TenantContextService } from './tenant-context.service'

/** The request store the middleware opens for a request whose client address is `ip`. */
function storeFor(ip: string | undefined) {
  const middleware = new TenantContextMiddleware(new TenantContextService(undefined as never))
  let store: ReturnType<typeof TenantContextService.peek>
  middleware.use({ ip }, undefined, () => {
    store = { ...TenantContextService.peek() }
  })
  return store!
}

describe('TenantContextMiddleware', () => {
  it('keeps the full address and the /64 apart', () => {
    const store = storeFor('2001:db8:1:2:3:4:5:6')

    expect(store.clientIp).toBe('2001:db8:1:2:3:4:5:6')
    expect(store.clientAddress).toBe('2001:db8:1:2::/64')
  })

  it('reduces an IPv4-mapped address to IPv4 in both', () => {
    const store = storeFor('::ffff:203.0.113.7')

    expect(store.clientIp).toBe('203.0.113.7')
    expect(store.clientAddress).toBe('203.0.113.7')
  })

  it('keeps an IPv4 address as it is', () => {
    expect(storeFor('198.51.100.4')).toMatchObject({
      clientIp: '198.51.100.4',
      clientAddress: '198.51.100.4',
    })
  })
})
