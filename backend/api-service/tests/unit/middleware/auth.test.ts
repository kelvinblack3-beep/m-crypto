import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('jose', async (importOriginal) => {
  return {
    ...(await importOriginal<typeof import('jose')>()),
    createRemoteJWKSet: vi.fn(() => {
      const fn = vi.fn()
      // Tag the returned key-resolver so we can assert cache reuse by identity.
      ;(fn as unknown as { __jwksId: number }).__jwksId = Math.random()
      return fn
    }),
    jwtVerify: vi.fn(),
  }
})

import { createRemoteJWKSet, errors, jwtVerify } from 'jose'

import { authMiddleware, _resetJwksCacheForTests } from '../../../src/middleware/auth'
import type { HonoEnv } from '../../../src/env'

const BINDINGS = {
  NEWLY_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://test',
  JWKS_URL: 'https://auth.example.test/.well-known/jwks.json',
  JWT_ISSUER: 'https://auth.example.test',
  // Bindings we don't touch in these tests.
  R2_BLOBS: {} as HonoEnv['Bindings']['R2_BLOBS'],
  R2_STORAGE: {} as HonoEnv['Bindings']['R2_STORAGE'],
  R2_PUBLIC: {} as HonoEnv['Bindings']['R2_PUBLIC'],
  QUEUE_DEFAULT: {} as HonoEnv['Bindings']['QUEUE_DEFAULT'],
} as unknown as HonoEnv['Bindings']

function buildApp(bindings: HonoEnv['Bindings'] = BINDINGS) {
  const app = new Hono<HonoEnv>()
  app.use('*', authMiddleware)
  app.get('/me', (c) => c.json({ userId: c.get('userId'), email: c.get('email') }))
  return {
    fetch: (path: string, init?: RequestInit) =>
      app.fetch(new Request(`http://localhost${path}`, init), bindings),
  }
}

describe('authMiddleware', () => {
  beforeEach(() => {
    _resetJwksCacheForTests()
    vi.mocked(createRemoteJWKSet).mockClear()
    vi.mocked(jwtVerify).mockReset()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const app = buildApp()
    const res = await app.fetch('/me')

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('unauthorized')
    expect(jwtVerify).not.toHaveBeenCalled()
  })

  it('returns 401 when scheme is not Bearer', async () => {
    const app = buildApp()
    const res = await app.fetch('/me', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('unauthorized')
    expect(jwtVerify).not.toHaveBeenCalled()
  })

  it('returns 401 when Bearer token is empty', async () => {
    const app = buildApp()
    const res = await app.fetch('/me', {
      headers: { Authorization: 'Bearer    ' },
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('unauthorized')
    expect(jwtVerify).not.toHaveBeenCalled()
  })

  it('returns 401 when jwtVerify throws (malformed/invalid token)', async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(new errors.JWSInvalid('malformed'))

    const app = buildApp()
    const res = await app.fetch('/me', {
      headers: { Authorization: 'Bearer not-a-real-jwt' },
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('unauthorized')
    expect(jwtVerify).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when verified payload has no sub', async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { iss: BINDINGS.JWT_ISSUER },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

    const app = buildApp()
    const res = await app.fetch('/me', {
      headers: { Authorization: 'Bearer token-without-sub' },
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('unauthorized')
  })

  it('calls next and exposes c.get("userId") and c.get("email") when token is valid', async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { sub: 'user_123', email: 'alice@example.test', iss: BINDINGS.JWT_ISSUER },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

    const app = buildApp()
    const res = await app.fetch('/me', {
      headers: { Authorization: 'Bearer good-token' },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string; email?: string }
    expect(body.userId).toBe('user_123')
    expect(body.email).toBe('alice@example.test')

    // jwtVerify was called with the trimmed token, the JWKS resolver, and the expected issuer.
    expect(jwtVerify).toHaveBeenCalledTimes(1)
    const [token, , options] = vi.mocked(jwtVerify).mock.calls[0]!
    expect(token).toBe('good-token')
    expect(options).toEqual({ issuer: BINDINGS.JWT_ISSUER })
  })

  it('caches the JWKS resolver across calls within TTL (same JWKS_URL)', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: 'user_123', iss: BINDINGS.JWT_ISSUER },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

    const app = buildApp()

    const res1 = await app.fetch('/me', {
      headers: { Authorization: 'Bearer good-token' },
    })
    const res2 = await app.fetch('/me', {
      headers: { Authorization: 'Bearer good-token' },
    })

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)

    // First call constructs the JWKS resolver; second call must reuse the cached one.
    expect(createRemoteJWKSet).toHaveBeenCalledTimes(1)

    // Both jwtVerify invocations receive the exact same resolver reference.
    const calls = vi.mocked(jwtVerify).mock.calls
    expect(calls.length).toBe(2)
    expect(calls[0]![1]).toBe(calls[1]![1])
  })

  it('rebuilds the JWKS resolver when JWKS_URL changes', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: 'user_123', iss: BINDINGS.JWT_ISSUER },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

    const appA = buildApp({ ...BINDINGS, JWKS_URL: 'https://auth-a.example.test/jwks' })
    const appB = buildApp({ ...BINDINGS, JWKS_URL: 'https://auth-b.example.test/jwks' })

    await appA.fetch('/me', { headers: { Authorization: 'Bearer t' } })
    await appB.fetch('/me', { headers: { Authorization: 'Bearer t' } })

    expect(createRemoteJWKSet).toHaveBeenCalledTimes(2)
  })
})
