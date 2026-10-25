import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('api-service integration (workerd)', () => {
  describe('GET /health', () => {
    it('returns 200', async () => {
      const res = await SELF.fetch('https://example.com/health')
      expect(res.status).toBe(200)
    })

    it('sets X-Request-Id header', async () => {
      const res = await SELF.fetch('https://example.com/health')
      const requestId = res.headers.get('x-request-id')
      expect(requestId).toBeTruthy()
      expect(requestId).toMatch(UUID_RE)
    })
  })

  describe('GET /me', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await SELF.fetch('https://example.com/me')
      expect(res.status).toBe(401)
    })

    it('sets X-Request-Id header on 401', async () => {
      const res = await SELF.fetch('https://example.com/me')
      expect(res.headers.get('x-request-id')).toMatch(UUID_RE)
    })
  })

  describe('unknown route', () => {
    it('returns 404', async () => {
      const res = await SELF.fetch('https://example.com/this-route-does-not-exist')
      expect(res.status).toBe(404)
    })

    it('sets X-Request-Id header on 404', async () => {
      const res = await SELF.fetch('https://example.com/this-route-does-not-exist')
      expect(res.headers.get('x-request-id')).toMatch(UUID_RE)
    })
  })

  describe('X-Request-Id', () => {
    it('is unique per request', async () => {
      const [a, b] = await Promise.all([
        SELF.fetch('https://example.com/health'),
        SELF.fetch('https://example.com/health'),
      ])
      const idA = a.headers.get('x-request-id')
      const idB = b.headers.get('x-request-id')
      expect(idA).toMatch(UUID_RE)
      expect(idB).toMatch(UUID_RE)
      expect(idA).not.toBe(idB)
    })
  })
})
