import type { Context, MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import type { HonoEnv } from '../env'
import { logEvent } from '../observability'
import { neon } from '@neondatabase/serverless'

const JWKS_CACHE_TTL_S = 600

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null
let cachedJwksUrl: string | null = null

function jwks(env: HonoEnv['Bindings']): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks && cachedJwksUrl === env.JWKS_URL) return cachedJwks
  cachedJwks = createRemoteJWKSet(new URL(env.JWKS_URL), {
    cacheMaxAge: JWKS_CACHE_TTL_S * 1000,
    cooldownDuration: 30000,
  })
  cachedJwksUrl = env.JWKS_URL
  return cachedJwks
}

export function _resetJwksCacheForTests(): void {
  cachedJwks = null
  cachedJwksUrl = null
}

// jose throws these (or a raw fetch error) when the key set itself could not be read, so the
// token was never checked. A 401 there blames a valid bearer for our outage.
const KEY_SET_UNAVAILABLE = new Set([errors.JWKSTimeout.code, errors.JWKSInvalid.code, errors.JOSEError.code])

export function rejectToken(c: Context<HonoEnv>, err: unknown, verifier: 'app' | 'oidc'): Response {
  const code = err instanceof errors.JOSEError ? err.code : null
  const requestId = c.get('requestId')
  if (code === null || KEY_SET_UNAVAILABLE.has(code)) {
    logEvent({
      level: 'error',
      msg: 'auth.key_set_unavailable',
      request_id: requestId,
      meta: { verifier, code, error: err instanceof Error ? err.message : String(err) },
    })
    c.header('Retry-After', '1')
    return c.json({ error: 'auth_unavailable', request_id: requestId }, 503)
  }
  logEvent({ level: 'info', msg: 'auth.token_rejected', request_id: requestId, meta: { verifier, reason: code } })
  return c.json({ error: 'unauthorized' }, 401)
}

export const authMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const token = auth.slice(7).trim()
  if (!token) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const keys = jwks(c.env)
  const fetchingKeys = !keys.fresh
  const start = Date.now()
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: c.env.JWT_ISSUER })
    if (!payload.sub) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    if (typeof payload.sessionId !== 'string') return c.json({ error: 'Sign in again' }, 401)
    const sql = neon(c.env.DATABASE_URL)
    const sessions = await sql`SELECT id FROM auth.session WHERE id=${payload.sessionId} AND "userId"=${payload.sub} AND "expiresAt">now()`
    if (!sessions.length) return c.json({ error: 'Session expired. Sign in again' }, 401)
    c.set('userId', payload.sub as string)
    if (typeof payload.email === 'string') c.set('email', payload.email)
  } catch (err) {
    return rejectToken(c, err, 'app')
  } finally {
    if (fetchingKeys) {
      logEvent({ level: 'info', msg: 'auth.jwks_fetch', request_id: c.get('requestId'), duration_ms: Date.now() - start })
    }
  }
  await next()
}
