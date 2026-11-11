import { describe, expect, it } from 'vitest'
import { devServerAddress } from './env.config.ts'

describe('devServerAddress', () => {
  it('binds the loopback interface by default', () => {
    expect(devServerAddress({})).toEqual({ host: '127.0.0.1', port: 5173 })
  })

  it('takes the host and the port from the environment', () => {
    expect(devServerAddress({ OPOS_PANEL_HOST: '0.0.0.0', OPOS_PANEL_PORT: '5273' })).toEqual({
      host: '0.0.0.0',
      port: 5273,
    })
  })

  it('reads an empty value as unset', () => {
    expect(devServerAddress({ OPOS_PANEL_HOST: ' ', OPOS_PANEL_PORT: '' })).toEqual({
      host: '127.0.0.1',
      port: 5173,
    })
  })

  it.each(['abc', '0', '65536', '51.5'])('refuses the port %s', (port) => {
    expect(() => devServerAddress({ OPOS_PANEL_PORT: port })).toThrow('OPOS_PANEL_PORT')
  })
})
