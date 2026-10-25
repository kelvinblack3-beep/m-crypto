import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('CORS middleware (workerd)', () => {
  describe('OPTIONS preflight on /me', () => {
    it('responds with Access-Control-Allow-* headers', async () => {
      const res = await SELF.fetch('https://example.com/me', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.example.com',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Authorization, Content-Type',
        },
      })

      expect(res.headers.get('access-control-allow-origin')).toBeTruthy()
      expect(res.headers.get('access-control-allow-methods')).toBeTruthy()
      expect(res.headers.get('access-control-allow-headers')).toBeTruthy()
    })

    it('echoes the request Origin in Access-Control-Allow-Origin', async () => {
      const origin = 'https://app.example.com'
      const res = await SELF.fetch('https://example.com/me', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
        },
      })

      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
    })

    it('echoes a different Origin verbatim', async () => {
      const origin = 'https://another.example.org'
      const res = await SELF.fetch('https://example.com/me', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
        },
      })

      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
    })

    it('falls back to "*" when no Origin header is sent', async () => {
      const res = await SELF.fetch('https://example.com/me', {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'GET',
        },
      })

      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })

    it('sets Access-Control-Max-Age to 86400', async () => {
      const res = await SELF.fetch('https://example.com/me', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.example.com',
          'Access-Control-Request-Method': 'GET',
        },
      })

      expect(res.headers.get('access-control-max-age')).toBe('86400')
    })
  })
})
