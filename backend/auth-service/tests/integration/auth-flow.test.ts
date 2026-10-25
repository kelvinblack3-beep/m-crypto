import { SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// -----------------------------------------------------------------------------
// Contract: every request to `/api/auth/*` MUST be forwarded to Better Auth's
// `auth.handler(req)` with the raw Request, and whatever Response that handler
// produces MUST be returned verbatim by the worker. `/health` and `/healthz`
// MUST be served entirely by the worker and never reach Better Auth.
//
// We assert that contract by mocking `better-auth` with a fake `betterAuth()`
// that returns a handler which:
//   1. Records every Request it received.
//   2. Returns a recognisable, unique Response (with custom status, headers
//      and body) so we can prove the worker returns it unchanged.
//
// To keep the mock self-contained (no Neon driver, no drizzle import-time work)
// we also stub the db client and the drizzle adapter — same shape as the unit
// tests under tests/unit/.
// -----------------------------------------------------------------------------

// Bag of Requests the fake handler has been called with — shared across calls
// in this test file. Cleared in `beforeEach`.
const recordedRequests: Request[] = []
// Bodies are read inside the handler: workerd forbids reading a request body from
// the test's context once the worker's request has finished.
const recordedBodies: string[] = []

// Build a deterministic, distinctive Response for each call so we can verify
// the worker returns it byte-for-byte.
function fakeResponse(req: Request): Response {
  return new Response(
    JSON.stringify({
      from: 'fake-better-auth',
      method: req.method,
      url: req.url,
    }),
    {
      status: 418,
      headers: {
        'Content-Type': 'application/json',
        'X-Fake-Better-Auth': 'yes',
        'X-Echo-Method': req.method,
      },
    },
  )
}

vi.mock('better-auth', () => ({
  betterAuth: vi.fn(() => ({
    handler: vi.fn(async (req: Request) => {
      recordedRequests.push(req)
      recordedBodies.push(await req.clone().text())
      return fakeResponse(req)
    }),
  })),
}))

// Keep drizzle / Neon / @better-auth plugins inert. None of them should run
// in this test, but `createAuth` still imports them at module load.
vi.mock('../../src/db/client', () => ({
  createDb: vi.fn(() => ({ __mock: 'db' })),
  schema: {},
}))

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: vi.fn(() => ({ __mock: 'adapter' })),
}))

vi.mock('@better-auth/expo', () => ({
  expo: vi.fn(() => ({ id: 'expo' })),
}))

vi.mock('better-auth/plugins', () => ({
  jwt: vi.fn(() => ({ id: 'jwt' })),
}))

const BASE = 'https://auth.test.example'

describe('auth-service integration: Better Auth wiring contract', () => {
  beforeEach(() => {
    recordedRequests.length = 0
    recordedBodies.length = 0
  })

  describe('/api/auth/* is delegated to Better Auth', () => {
    it.each([
      ['POST', '/api/auth/sign-in/email'],
      ['POST', '/api/auth/sign-up/email'],
      ['POST', '/api/auth/sign-out'],
      ['GET', '/api/auth/get-session'],
      ['GET', '/api/auth/jwks'],
      ['GET', '/api/auth/.well-known/openid-configuration'],
      ['PATCH', '/api/auth/update-user'],
      ['DELETE', '/api/auth/session'],
    ])('%s %s reaches the Better Auth handler', async (method, path) => {
      const init: RequestInit =
        method === 'GET' || method === 'DELETE'
          ? { method }
          : {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ probe: true }),
            }

      const res = await SELF.fetch(`${BASE}${path}`, init)

      // Handler was invoked exactly once for this request.
      expect(recordedRequests).toHaveLength(1)
      const received = recordedRequests[0]!

      // The handler received the RAW Request — same method, same path.
      expect(received).toBeInstanceOf(Request)
      expect(received.method).toBe(method)
      expect(new URL(received.url).pathname).toBe(path)

      // The worker returned the handler's Response unchanged: same status,
      // same custom header, same body shape.
      expect(res.status).toBe(418)
      expect(res.headers.get('X-Fake-Better-Auth')).toBe('yes')
      expect(res.headers.get('X-Echo-Method')).toBe(method)
      expect(res.headers.get('Content-Type')).toContain('application/json')

      const body = (await res.json()) as {
        from: string
        method: string
        url: string
      }
      expect(body.from).toBe('fake-better-auth')
      expect(body.method).toBe(method)
      expect(new URL(body.url).pathname).toBe(path)
    })

    it('forwards the request body to Better Auth intact', async () => {
      const payload = { email: 'alice@example.com', password: 'hunter2!' }
      await SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      expect(recordedRequests).toHaveLength(1)
      expect(JSON.parse(recordedBodies[0]!)).toEqual(payload)
    })

    it('forwards request headers (Authorization, custom) to Better Auth', async () => {
      await SELF.fetch(`${BASE}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token-xyz',
          'X-Request-Id': 'req-abc-123',
        },
      })

      expect(recordedRequests).toHaveLength(1)
      const received = recordedRequests[0]!
      expect(received.headers.get('Authorization')).toBe('Bearer test-token-xyz')
      expect(received.headers.get('X-Request-Id')).toBe('req-abc-123')
    })

    it('returns the handler Response unchanged when the handler 4xx/5xx', async () => {
      // Re-mock the handler for this single assertion to ensure a non-2xx
      // status from Better Auth survives the worker pipeline intact.
      const betterAuthModule = await import('better-auth')
      const errorHandler = vi.fn(
        async () =>
          new Response('boom', {
            status: 503,
            headers: { 'X-From': 'fake-better-auth', 'Retry-After': '7' },
          }),
      )
      vi.mocked(betterAuthModule.betterAuth).mockReturnValueOnce({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: errorHandler as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const res = await SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'x@y.z', password: 'wrong' }),
      })

      expect(errorHandler).toHaveBeenCalledTimes(1)
      expect(res.status).toBe(503)
      expect(res.headers.get('Retry-After')).toBe('7')
      expect(res.headers.get('X-From')).toBe('fake-better-auth')
      expect(await res.text()).toBe('boom')
    })
  })

  describe('/health and /healthz bypass Better Auth', () => {
    it('GET /health is served by the worker, never reaches the handler', async () => {
      const res = await SELF.fetch(`${BASE}/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, service: 'auth' })
      expect(recordedRequests).toHaveLength(0)
    })

    it('GET /healthz is served by the worker, never reaches the handler', async () => {
      const res = await SELF.fetch(`${BASE}/healthz`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, service: 'auth' })
      expect(recordedRequests).toHaveLength(0)
    })

    it('a /health hit followed by an /api/auth/* hit only records the latter', async () => {
      await SELF.fetch(`${BASE}/health`)
      await SELF.fetch(`${BASE}/healthz`)
      expect(recordedRequests).toHaveLength(0)

      await SELF.fetch(`${BASE}/api/auth/jwks`)
      expect(recordedRequests).toHaveLength(1)
      expect(new URL(recordedRequests[0]!.url).pathname).toBe('/api/auth/jwks')
    })
  })
})
