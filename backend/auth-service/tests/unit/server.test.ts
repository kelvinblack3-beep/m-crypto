import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlerMock = vi.fn(async (req: Request) => {
  return new Response(
    JSON.stringify({ mocked: true, url: req.url, method: req.method }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})

vi.mock('../../src/auth', () => ({
  createAuth: vi.fn(() => ({ handler: handlerMock })),
}))

import server from '../../src/server'
import { createAuth } from '../../src/auth'

const env = {
  NEWLY_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://test',
  BETTER_AUTH_SECRET: 'test-secret',
  BETTER_AUTH_URL: 'http://localhost',
} as unknown as Parameters<NonNullable<typeof server.fetch>>[1]

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext

function fetchApp(req: Request) {
  return server.fetch!(req as Parameters<NonNullable<typeof server.fetch>>[0], env, ctx)
}

describe('auth-service server', () => {
  beforeEach(() => {
    handlerMock.mockClear()
    vi.mocked(createAuth).mockClear()
  })

  describe('health endpoints', () => {
    it('GET /health returns 200 with { ok: true, service: "auth" }', async () => {
      const res = await fetchApp(new Request('http://localhost/health'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ ok: true, service: 'auth' })
    })

    it('GET /healthz returns 200 with { ok: true, service: "auth" }', async () => {
      const res = await fetchApp(new Request('http://localhost/healthz'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ ok: true, service: 'auth' })
    })

    it('does not invoke createAuth for /health', async () => {
      await fetchApp(new Request('http://localhost/health'))
      expect(createAuth).not.toHaveBeenCalled()
      expect(handlerMock).not.toHaveBeenCalled()
    })
  })

  describe('CORS preflight', () => {
    it('OPTIONS /api/auth/sign-in/email returns CORS headers reflecting the origin', async () => {
      const origin = 'https://app.example.com'
      const res = await fetchApp(
        new Request('http://localhost/api/auth/sign-in/email', {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type, Authorization',
          },
        }),
      )

      expect(res.status).toBeGreaterThanOrEqual(200)
      expect(res.status).toBeLessThan(300)

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin)
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')

      const allowMethods = res.headers.get('Access-Control-Allow-Methods') ?? ''
      expect(allowMethods).toMatch(/POST/i)
      expect(allowMethods).toMatch(/OPTIONS/i)

      const allowHeaders = res.headers.get('Access-Control-Allow-Headers') ?? ''
      expect(allowHeaders).toMatch(/Authorization/i)
      expect(allowHeaders).toMatch(/Content-Type/i)
    })

    it('preflight short-circuits before the Better Auth handler', async () => {
      await fetchApp(
        new Request('http://localhost/api/auth/sign-in/email', {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://app.example.com',
            'Access-Control-Request-Method': 'POST',
          },
        }),
      )
      expect(handlerMock).not.toHaveBeenCalled()
    })

    it('falls back to "*" when no Origin header is sent', async () => {
      const res = await fetchApp(
        new Request('http://localhost/api/auth/sign-in/email', {
          method: 'OPTIONS',
          headers: { 'Access-Control-Request-Method': 'POST' },
        }),
      )
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('/api/auth/* fall-through to createAuth', () => {
    it('POST /api/auth/sign-in/email delegates to the Better Auth handler', async () => {
      const req = new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com', password: 'pw' }),
      })

      const res = await fetchApp(req)

      expect(createAuth).toHaveBeenCalledTimes(1)
      expect(createAuth).toHaveBeenCalledWith(
        expect.objectContaining({ NEWLY_ENV: 'test' }),
        expect.any(Request),
      )
      expect(handlerMock).toHaveBeenCalledTimes(1)

      const forwarded = handlerMock.mock.calls[0]![0] as Request
      expect(forwarded.method).toBe('POST')
      expect(new URL(forwarded.url).pathname).toBe('/api/auth/sign-in/email')

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ mocked: true, method: 'POST' })
    })

    it('GET /api/auth/jwks delegates to the Better Auth handler', async () => {
      const res = await fetchApp(
        new Request('http://localhost/api/auth/jwks', { method: 'GET' }),
      )
      expect(handlerMock).toHaveBeenCalledTimes(1)
      expect(res.status).toBe(200)
    })

    it('arbitrary methods on /api/auth/* still fall through (app.all)', async () => {
      const res = await fetchApp(
        new Request('http://localhost/api/auth/session', { method: 'DELETE' }),
      )
      expect(handlerMock).toHaveBeenCalledTimes(1)
      const forwarded = handlerMock.mock.calls[0]![0] as Request
      expect(forwarded.method).toBe('DELETE')
      expect(res.status).toBe(200)
    })
  })
})
