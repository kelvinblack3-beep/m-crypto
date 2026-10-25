import { Hono } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose'

import { authMiddleware, _resetJwksCacheForTests } from '../../../src/middleware/auth'
import { oidcMiddleware, _resetGoogleJwksCacheForTests } from '../../../src/middleware/oidc'
import type { HonoEnv } from '../../../src/env'

// Real jose against a stubbed key-set endpoint: a key set we cannot fetch is our
// outage (retryable 503), a token that fails verification is the caller's (401).

const JWKS_URL = 'https://auth-p1-dev.api-dev.newlyapp.com/api/auth/jwks'
const ISSUER = 'https://auth-p1-dev.api-dev.newlyapp.com'
const KID = 'k1'

const BINDINGS = {
  NEWLY_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://test',
  JWKS_URL,
  JWT_ISSUER: ISSUER,
  NEWLY_SCHEDULER_SA: 'scheduler@newly.iam.gserviceaccount.com',
} as unknown as HonoEnv['Bindings']

let privateKey: KeyLike
let publicJwk: JWK
let keySetEndpoint: (init?: RequestInit) => Promise<Response>
let keySetFetches = 0

function signToken(expiresAt: number | string = '5m'): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'EdDSA', kid: KID })
    .setIssuer(ISSUER)
    .setSubject('user-1')
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(privateKey)
}

function serveKeySet(): Promise<Response> {
  return Promise.resolve(Response.json({ keys: [publicJwk] }))
}

function hangUntilAborted(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })
}

function app() {
  const hono = new Hono<HonoEnv>()
  hono.get('/me', authMiddleware, (c) => c.json({ userId: c.get('userId') }))
  hono.get('/_internal/cron-manifest', oidcMiddleware, (c) => c.json({ ok: true }))
  return (path: string, token: string) =>
    hono.fetch(new Request(`https://api.test${path}`, { headers: { Authorization: `Bearer ${token}` } }), BINDINGS)
}

function logged(spy: ReturnType<typeof vi.spyOn>, msg: string) {
  return spy.mock.calls
    .map(([line]) => JSON.parse(String(line)) as { msg: string; duration_ms?: number; meta?: Record<string, unknown> })
    .filter((ev) => ev.msg === msg)
}

describe('authMiddleware when the key set is unavailable', () => {
  let errorLog: ReturnType<typeof vi.spyOn>
  let infoLog: ReturnType<typeof vi.spyOn>

  beforeAll(async () => {
    const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
    privateKey = pair.privateKey
    publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'EdDSA', use: 'sig' }
  })

  beforeEach(() => {
    _resetJwksCacheForTests()
    _resetGoogleJwksCacheForTests()
    keySetFetches = 0
    keySetEndpoint = serveKeySet
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url !== JWKS_URL && !url.startsWith('https://www.googleapis.com/')) throw new Error(`unexpected fetch: ${url}`)
        keySetFetches += 1
        return keySetEndpoint(init)
      }),
    )
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    infoLog = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('answers a timed-out key fetch with a retryable 503 and logs the cause', { timeout: 10_000 }, async () => {
    keySetEndpoint = hangUntilAborted
    const res = await app()('/me', await signToken())

    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(((await res.json()) as { error: string }).error).toBe('auth_unavailable')
    expect(logged(errorLog, 'auth.key_set_unavailable')[0]?.meta?.code).toBe('ERR_JWKS_TIMEOUT')
  })

  it('lets the very next call through once the auth-service answers again', async () => {
    keySetEndpoint = () => Promise.resolve(new Response('upstream error', { status: 500 }))
    const call = app()
    const token = await signToken()

    const first = await call('/me', token)
    expect(first.status).toBe(503)
    expect(logged(errorLog, 'auth.key_set_unavailable')[0]?.meta?.code).toBe('ERR_JOSE_GENERIC')

    keySetEndpoint = serveKeySet
    const second = await call('/me', token)
    expect(second.status).toBe(200)
    expect(((await second.json()) as { userId: string }).userId).toBe('user-1')
  })

  it('answers a network failure reaching the auth-service with a 503', async () => {
    keySetEndpoint = () => Promise.reject(new TypeError('Network connection lost.'))
    const res = await app()('/me', await signToken())

    expect(res.status).toBe(503)
    expect(logged(errorLog, 'auth.key_set_unavailable')[0]?.meta).toMatchObject({ code: null })
  })

  it('answers an auth-service that serves a malformed key set with a 503', async () => {
    keySetEndpoint = () => Promise.resolve(Response.json({ keys: 'nope' }))
    const res = await app()('/me', await signToken())

    expect(res.status).toBe(503)
    expect(logged(errorLog, 'auth.key_set_unavailable')[0]?.meta?.code).toBe('ERR_JWKS_INVALID')
  })

  it('keeps 401 for an expired token and logs it apart from other rejections', async () => {
    const res = await app()('/me', await signToken(Math.floor(Date.now() / 1000) - 60))

    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: string }).error).toBe('unauthorized')
    expect(logged(infoLog, 'auth.token_rejected')[0]?.meta?.reason).toBe('ERR_JWT_EXPIRED')
    expect(logged(errorLog, 'auth.key_set_unavailable')).toHaveLength(0)
  })

  it('keeps 401 for a token signed by a key the auth-service never issued', async () => {
    const other = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setIssuer(ISSUER)
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(other.privateKey)
    const res = await app()('/me', forged)

    expect(res.status).toBe(401)
    expect(logged(infoLog, 'auth.token_rejected')[0]?.meta?.reason).toBe('ERR_JWS_SIGNATURE_VERIFICATION_FAILED')
  })

  it('times the key fetch on a cold isolate and not on calls served from the cache', async () => {
    const call = app()
    const token = await signToken()

    expect((await call('/me', token)).status).toBe(200)
    expect((await call('/me', token)).status).toBe(200)

    expect(keySetFetches).toBe(1)
    const fetches = logged(infoLog, 'auth.jwks_fetch')
    expect(fetches).toHaveLength(1)
    expect(typeof fetches[0]?.duration_ms).toBe('number')
  })

  it('gives the internal OIDC routes the same 503 when Google keys cannot be fetched', async () => {
    keySetEndpoint = () => Promise.reject(new TypeError('Network connection lost.'))
    const res = await app()('/_internal/cron-manifest', await signToken())

    expect(res.status).toBe(503)
    expect(logged(errorLog, 'auth.key_set_unavailable')[0]?.meta?.verifier).toBe('oidc')
  })
})
